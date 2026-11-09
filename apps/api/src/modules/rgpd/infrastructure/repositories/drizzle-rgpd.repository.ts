import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  isNull,
  lte,
  resolveExecutor,
  schema,
} from "@packages/drizzle";
import { verifyPassword as verifyHash } from "better-auth/crypto";
import type { Logger } from "../../../../shared/logger";
import type {
  ExecuteWipeOutput,
  IRgpdRepository,
  PendingDeletionRow,
  RgpdError,
  UserDeletionState,
} from "../../application/ports/rgpd.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;
const ANONYMIZED_DOMAIN = "anonymized.local";
const ANONYMIZED_NAME = "[deleted]";

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

  async findUsersReadyForWipe(limit: number): Promise<Result<PendingDeletionRow[], RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > findUsersReadyForWipe" },
      async () => {
        try {
          const query = exec
            .select({
              userId: schema.user.id,
              email: schema.user.email,
              pendingDeletionUntil: schema.user.pendingDeletionUntil,
            })
            .from(schema.user)
            .where(
              and(lte(schema.user.pendingDeletionUntil, new Date()), isNull(schema.user.deletedAt)),
            )
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
          const anonymizedEmail = `deleted-${crypto.randomUUID()}@${ANONYMIZED_DOMAIN}`;
          const updatedRows = await exec
            .update(schema.user)
            .set({
              email: anonymizedEmail,
              name: ANONYMIZED_NAME,
              image: null,
              emailVerified: false,
              pendingDeletionUntil: null,
              deletedAt: new Date(),
            })
            .where(and(eq(schema.user.id, userId), isNull(schema.user.deletedAt)))
            .returning({ id: schema.user.id });

          if (updatedRows.length === 0) {
            // Another overlapping run already wiped this account between our
            // pending-deletion read and this transaction: nothing left to do,
            // and the caller must not emit USER_DELETED a second time.
            return Result.ok({ alreadyWiped: true });
          }

          await exec.delete(schema.session).where(eq(schema.session.userId, userId));
          await exec.delete(schema.account).where(eq(schema.account.userId, userId));

          return Result.ok({ alreadyWiped: false });
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.executeWipe failed");
          return Result.fail(repositoryFailure("executeWipe"));
        }
      },
    );
  }

  async verifyPassword(userId: string, password: string): Promise<Result<boolean, RgpdError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleRgpdRepository > verifyPassword" },
      async () => {
        try {
          const accQuery = exec
            .select({ password: schema.account.password })
            .from(schema.account)
            .where(
              and(eq(schema.account.userId, userId), eq(schema.account.providerId, "credential")),
            )
            .limit(1);
          const [acc] = await this.instrumentation.startSpan(
            { name: accQuery.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => accQuery.execute(),
          );
          if (!acc?.password) return Result.ok(false);
          const ok = await verifyHash({ hash: acc.password, password });
          return Result.ok(ok);
        } catch (err) {
          this.instrumentation.capture(err);
          this.logger.error({ err, userId }, "RgpdRepository.verifyPassword failed");
          return Result.fail(repositoryFailure("verifyPassword"));
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
              deletedAt: schema.user.deletedAt,
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
              deletedAt: Option.fromNullable(u.deletedAt),
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
