import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  claimedSet,
  db,
  dbOperationFailure,
  eq,
  inArray,
  isDue,
  leasedBy,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import { alertDigestPreference, alertWeeklyDigest } from "../../../schemas/weekly-digest.schema";
import type { AlertsError } from "../../application/ports/alert-repository.port";
import type {
  ClaimedDigest,
  DigestLease,
  DigestSettlement,
  IWeeklyDigestRepository,
} from "../../application/ports/weekly-digest-repository.port";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

function fencedBy(lease: DigestLease): SQL | undefined {
  return and(
    leasedBy(alertWeeklyDigest, { id: lease.digestId, attempts: lease.attempts }),
    eq(alertWeeklyDigest.status, "pending"),
  );
}

export function digestClaimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  limit: number,
  leaseSeconds: number,
  scope?: SQL,
) {
  const due = db
    .select({ id: alertWeeklyDigest.id })
    .from(alertWeeklyDigest)
    .where(
      and(eq(alertWeeklyDigest.status, "pending"), isDue(alertWeeklyDigest.nextAttemptAt), scope),
    )
    .orderBy(asc(alertWeeklyDigest.createdAt))
    .limit(limit)
    .for("update", { skipLocked: true });

  return exec
    .update(alertWeeklyDigest)
    .set(claimedSet(alertWeeklyDigest, leaseSeconds))
    .where(inArray(alertWeeklyDigest.id, due))
    .returning();
}

export class DrizzleWeeklyDigestRepository implements IWeeklyDigestRepository {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly claimScope?: SQL,
  ) {}

  async plan(
    userIds: string[],
    weekStart: string,
    expiresAt: Date,
  ): Promise<Result<number, AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("plan", async () => {
      if (userIds.length === 0) return Result.ok(0);

      const query = exec
        .insert(alertWeeklyDigest)
        .values(userIds.map((userId) => ({ userId, weekStart, expiresAt })))
        .onConflictDoNothing({ target: [alertWeeklyDigest.weekStart, alertWeeklyDigest.userId] })
        .returning({ id: alertWeeklyDigest.id });
      const planned = await this.query(query);
      return Result.ok(planned.length);
    });
  }

  async claimDue(
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedDigest[], AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("claimDue", async () => {
      const rows = await this.query(digestClaimQuery(exec, limit, leaseSeconds, this.claimScope));
      return Result.ok(
        rows.map((row) => ({
          lease: { digestId: row.id, attempts: row.attempts },
          userId: row.userId,
          weekStart: row.weekStart,
          expiresAt: row.expiresAt,
          failures: row.failures,
        })),
      );
    });
  }

  async settle(
    lease: DigestLease,
    settlement: DigestSettlement,
  ): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("settle", async () => {
      const delivered =
        settlement.status === "sent"
          ? { channel: settlement.channel, sentAt: settlement.at }
          : { channel: null, sentAt: null };
      const query = exec
        .update(alertWeeklyDigest)
        .set({ status: settlement.status, ...delivered, nextAttemptAt: null })
        .where(fencedBy(lease))
        .returning({ id: alertWeeklyDigest.id });
      const updated = await this.query(query);
      return Result.ok(updated.length === 1);
    });
  }

  async addFailure(lease: DigestLease): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("addFailure", async () => {
      const query = exec
        .update(alertWeeklyDigest)
        .set({ failures: sql`${alertWeeklyDigest.failures} + 1` })
        .where(fencedBy(lease))
        .returning({ id: alertWeeklyDigest.id });
      const updated = await this.query(query);
      return Result.ok(updated.length === 1);
    });
  }

  async enabledFor(userId: string): Promise<Result<Option<boolean>, AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("enabledFor", async () => {
      const query = exec
        .select({ enabled: alertDigestPreference.enabled })
        .from(alertDigestPreference)
        .where(eq(alertDigestPreference.userId, userId))
        .limit(1);
      const rows = await this.query(query);
      return Result.ok(Option.fromNullable(rows[0]).map(({ enabled }) => enabled));
    });
  }

  async saveEnabled(
    userId: string,
    enabled: boolean,
    at: Date,
  ): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.traced("saveEnabled", async () => {
      const values = { enabled, updatedAt: at };
      const query = exec
        .insert(alertDigestPreference)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: alertDigestPreference.userId, set: values });
      await this.query(query);
      return Result.ok();
    });
  }

  private query<T>(query: { toSQL(): { sql: string }; execute(): Promise<T> }): Promise<T> {
    return this.instrumentation.startSpan(
      { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
      () => query.execute(),
    );
  }

  private traced<T>(
    method: string,
    work: () => Promise<Result<T, AlertsError>>,
  ): Promise<Result<T, AlertsError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleWeeklyDigestRepository > ${method}` },
      async () => {
        try {
          return await work();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}
