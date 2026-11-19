import type {
  AccessLossContext,
  IAccessLossContextReader,
} from "@modules/alerts/application/ports/access-loss-context.port";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  dbOperationFailure,
  eq,
  inArray,
  resolveExecutor,
} from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

const ACCESS_LOST = [
  "needs_reconnect",
  "blocked_by_school",
] as const satisfies readonly (typeof childAccount.$inferSelect.status)[];

export class AccessLossContextQuery implements IAccessLossContextReader {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async stillLost(
    userId: string,
    childId: string,
  ): Promise<Result<Option<AccessLossContext>, AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "AccessLossContextQuery > stillLost" },
      async () => {
        try {
          const query = exec
            .select({ email: authSchema.user.email, childLabel: childAccount.label })
            .from(childAccount)
            .innerJoin(authSchema.user, eq(authSchema.user.id, childAccount.userId))
            .where(
              and(
                eq(childAccount.id, childId),
                eq(childAccount.userId, userId),
                inArray(childAccount.status, ACCESS_LOST),
              ),
            )
            .limit(1);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok(Option.fromNullable(rows[0]));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(queryFailure("stillLost", err));
        }
      },
    );
  }
}
