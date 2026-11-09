import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, authSchema, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import type { ChildrenError } from "../../application/ports/child-repository.port";
import type {
  GoogleCredentials,
  IGoogleCredentialStore,
  TokenSealing,
} from "../../application/ports/google-credential-store.port";
import type { GoogleAccess } from "../../application/ports/google-oauth-client.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const storeFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

export class DrizzleGoogleCredentialStore implements IGoogleCredentialStore {
  constructor(
    private readonly sealing: TokenSealing,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async read(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<GoogleCredentials>, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleGoogleCredentialStore > read" },
      async () => {
        try {
          const query = exec
            .select({
              accessToken: authSchema.account.accessToken,
              accessTokenExpiresAt: authSchema.account.accessTokenExpiresAt,
              refreshToken: authSchema.account.refreshToken,
            })
            .from(authSchema.account)
            .where(
              and(
                eq(authSchema.account.id, linkedAccountId),
                eq(authSchema.account.userId, userId),
              ),
            )
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (!row) return Result.ok(Option.none());

          return Result.ok(
            Option.some({
              accessToken: await this.opened(row.accessToken),
              accessTokenExpiresAt: Option.fromNullable(row.accessTokenExpiresAt),
              refreshToken: await this.opened(row.refreshToken),
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("read"));
        }
      },
    );
  }

  async replace(
    userId: string,
    linkedAccountId: string,
    access: GoogleAccess,
  ): Promise<Result<void, ChildrenError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleGoogleCredentialStore > replace" },
      async () => {
        try {
          const refreshToken = access.refreshToken.isSome()
            ? { refreshToken: await this.sealing.seal(access.refreshToken.unwrap()) }
            : {};
          const query = exec
            .update(authSchema.account)
            .set({
              accessToken: await this.sealing.seal(access.accessToken),
              accessTokenExpiresAt: access.expiresAt,
              ...refreshToken,
            })
            .where(
              and(
                eq(authSchema.account.id, linkedAccountId),
                eq(authSchema.account.userId, userId),
              ),
            )
            .returning({ id: authSchema.account.id });
          const updated = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (updated.length === 0)
            return Result.fail({
              code: "CHILD_ACCOUNT_NOT_LINKED",
              message: "Ce compte Google n'est plus relié à votre compte. Ajoutez-le de nouveau.",
            });

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(storeFailure("replace"));
        }
      },
    );
  }

  private async opened(sealed: string | null): Promise<Option<string>> {
    if (!sealed) return Option.none();

    const opened = await this.sealing.open(sealed);
    if (opened.isSuccess) return Option.some(opened.getValue());

    this.instrumentation.capture(
      new Error(`linked account token unreadable: ${opened.getError()}`),
    );
    return Option.none();
  }
}
