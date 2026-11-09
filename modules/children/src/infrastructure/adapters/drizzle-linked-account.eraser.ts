import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, authSchema, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import { CHILD_PROVIDER_ID } from "../../application/config/child-provider";
import type { ChildrenError } from "../../application/ports/child-repository.port";
import type {
  ErasedAccount,
  ILinkedAccountEraser,
} from "../../application/ports/linked-account-eraser.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const eraserFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

export class DrizzleLinkedAccountEraser implements ILinkedAccountEraser {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async delete(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<ErasedAccount>, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleLinkedAccountEraser > delete" },
      async () => {
        try {
          const query = exec
            .delete(authSchema.account)
            .where(
              and(
                eq(authSchema.account.id, linkedAccountId),
                eq(authSchema.account.userId, userId),
                eq(authSchema.account.providerId, CHILD_PROVIDER_ID),
              ),
            )
            .returning({ accountId: authSchema.account.accountId });
          const [erased] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(erased));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(eraserFailure("delete"));
        }
      },
    );
  }
}
