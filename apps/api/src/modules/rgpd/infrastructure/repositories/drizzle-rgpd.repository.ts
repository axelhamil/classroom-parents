import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  lte,
  or,
  outboxSchema,
  resolveExecutor,
  schema,
  sql,
} from "@packages/drizzle";
import type { Logger } from "../../../../shared/logger";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  UserDeletionState,
} from "../../application/ports/rgpd.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("RGPD_REPOSITORY_PROVIDER_FAILURE");

export class DrizzleRgpdRepository implements IRgpdRepository {
  constructor(
    private readonly logger: Logger,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async markPendingDeletion(userId: string, until: Date): Promise<Result<void, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > markPendingDeletion" },
      async () => {
        try {
          const query = exec
            .update(schema.user)
            .set({ pendingDeletionUntil: until })
            .where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.markPendingDeletion failed");
          return Result.fail(repositoryFailure("markPendingDeletion"));
        }
      },
    );
  }

  async clearPendingDeletion(userId: string): Promise<Result<void, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > clearPendingDeletion" },
      async () => {
        try {
          const query = exec
            .update(schema.user)
            .set({ pendingDeletionUntil: null })
            .where(eq(schema.user.id, userId));
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.clearPendingDeletion failed");
          return Result.fail(repositoryFailure("clearPendingDeletion"));
        }
      },
    );
  }

  async findUsersReadyForWipe(
    now: Date,
    limit: number,
  ): Promise<Result<PendingDeletionRow[], RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > findUsersReadyForWipe" },
      async () => {
        try {
          const query = exec
            .select({
              userId: schema.user.id,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
            })
            .from(schema.user)
            .where(lte(schema.user.pendingDeletionUntil, now))
            .orderBy(schema.user.pendingDeletionUntil)
            .limit(limit);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(
            rows.flatMap(({ pendingDeletionUntil, ...row }): PendingDeletionRow[] =>
              pendingDeletionUntil ? [{ ...row, pendingDeletionUntil }] : [],
            ),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, limit }, "RgpdRepository.findUsersReadyForWipe failed");
          return Result.fail(repositoryFailure("findUsersReadyForWipe"));
        }
      },
    );
  }

  async executeWipe(userId: string): Promise<Result<ExecuteWipeOutput, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > executeWipe" },
      async () => {
        try {
          const deleted = await exec
            .delete(schema.user)
            .where(eq(schema.user.id, userId))
            .returning({ id: schema.user.id });
          if (deleted.length === 0) return Result.ok({ alreadyWiped: true });

          const { outboxEvent } = outboxSchema;
          await exec
            .delete(outboxEvent)
            .where(
              or(
                sql`${outboxEvent.payload}->>'userId' = ${userId}`,
                sql`${outboxEvent.payload}->>'actorUserId' = ${userId}`,
              ),
            );

          return Result.ok({ alreadyWiped: false });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.executeWipe failed");
          return Result.fail(repositoryFailure("executeWipe"));
        }
      },
    );
  }

  async findSessionStart(
    userId: string,
    sessionId: string,
  ): Promise<Result<Option<Date>, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > findSessionStart" },
      async () => {
        try {
          const query = exec
            .select({ createdAt: schema.session.createdAt })
            .from(schema.session)
            .where(and(eq(schema.session.id, sessionId), eq(schema.session.userId, userId)))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.createdAt));
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.findSessionStart failed");
          return Result.fail(repositoryFailure("findSessionStart"));
        }
      },
    );
  }

  async getUserDeletionState(
    userId: string,
  ): Promise<Result<Option<UserDeletionState>, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > getUserDeletionState" },
      async () => {
        try {
          const uQuery = exec
            .select({
              email: schema.user.email,
              name: schema.user.name,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
            })
            .from(schema.user)
            .where(eq(schema.user.id, userId))
            .limit(1);
          const [u] = await this.instrumentation.startSpan(
            { name: uQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => uQuery.execute(),
          );
          if (!u) return Result.ok(Option.none());
          return Result.ok(
            Option.some({
              email: u.email,
              name: u.name,
              pendingDeletionUntil: Option.fromNullable(u.pendingDeletionUntil),
            }),
          );
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.getUserDeletionState failed");
          return Result.fail(repositoryFailure("getUserDeletionState"));
        }
      },
    );
  }
}
