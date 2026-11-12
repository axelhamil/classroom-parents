import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, authSchema, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { CHILD_PROVIDER_ID } from "../../application/config/child-provider";
import type { ChildrenError } from "../../application/ports/child-repository.port";
import type {
  IGoogleLinkedAccounts,
  LinkedGoogleAccount,
} from "../../application/ports/google-linked-accounts.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const linkedAccountsFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

interface AccountRow {
  id: string;
  scope: string | null;
  refreshToken: string | null;
}

function toLinkedAccount(row: AccountRow): LinkedGoogleAccount {
  return {
    linkedAccountId: row.id,
    grantedScopes: (row.scope ?? "").split(/[\s,]+/).filter((scope) => scope.length > 0),
    hasRefreshToken: row.refreshToken !== null,
  };
}

export class DrizzleGoogleLinkedAccounts implements IGoogleLinkedAccounts {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async find(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<LinkedGoogleAccount>, ChildrenError>> {
    const listed = await this.select("find", userId, linkedAccountId);
    return listed.map(([row]) => Option.fromNullable(row));
  }

  async listForUser(userId: string): Promise<Result<LinkedGoogleAccount[], ChildrenError>> {
    return this.select("listForUser", userId);
  }

  private async select(
    method: string,
    userId: string,
    linkedAccountId?: string,
  ): Promise<Result<LinkedGoogleAccount[], ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleGoogleLinkedAccounts > ${method}` },
      async () => {
        try {
          const query = exec
            .select({
              id: authSchema.account.id,
              scope: authSchema.account.scope,
              refreshToken: authSchema.account.refreshToken,
            })
            .from(authSchema.account)
            .where(
              and(
                eq(authSchema.account.userId, userId),
                eq(authSchema.account.providerId, CHILD_PROVIDER_ID),
                linkedAccountId === undefined
                  ? undefined
                  : eq(authSchema.account.id, linkedAccountId),
              ),
            );
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.map(toLinkedAccount));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(linkedAccountsFailure(method, err));
        }
      },
    );
  }
}
