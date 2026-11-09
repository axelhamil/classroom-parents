import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, authSchema, dbOperationFailure, eq, resolveExecutor } from "@packages/drizzle";
import type { ChildrenError } from "../../application/ports/child-repository.port";
import type { ILinkedAccountEraser } from "../../application/ports/linked-account-eraser.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const eraserFailure = dbOperationFailure("CHILD_PROVIDER_FAILURE");

export class DrizzleLinkedAccountEraser implements ILinkedAccountEraser {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async delete(userId: string, linkedAccountId: string): Promise<Result<void, ChildrenError>> {
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
              ),
            );
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(eraserFailure("delete"));
        }
      },
    );
  }
}
