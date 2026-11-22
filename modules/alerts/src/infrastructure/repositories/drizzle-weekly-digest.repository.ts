import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  claimedSet,
  db,
  eq,
  inArray,
  isNull,
  leasedBy,
  lte,
  or,
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
  PlannedDigest,
} from "../../application/ports/weekly-digest-repository.port";
import { type RepositoryTracer, repositoryTracer } from "./repository-tracer";

function fencedBy(lease: DigestLease): SQL | undefined {
  return and(
    leasedBy(alertWeeklyDigest, { id: lease.digestId, attempts: lease.attempts }),
    eq(alertWeeklyDigest.status, "pending"),
  );
}

export function digestClaimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  now: Date,
  limit: number,
  leaseSeconds: number,
  scope?: SQL,
) {
  const reached = or(
    isNull(alertWeeklyDigest.nextAttemptAt),
    lte(alertWeeklyDigest.nextAttemptAt, now),
  );
  const due = db
    .select({ id: alertWeeklyDigest.id })
    .from(alertWeeklyDigest)
    .where(and(eq(alertWeeklyDigest.status, "pending"), reached, scope))
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
  private readonly tracer: RepositoryTracer;

  constructor(
    instrumentation: IInstrumentation,
    private readonly claimScope?: SQL,
  ) {
    this.tracer = repositoryTracer(instrumentation, "DrizzleWeeklyDigestRepository");
  }

  async plan(digests: PlannedDigest[], weekStart: string): Promise<Result<number, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("plan", async () => {
      if (digests.length === 0) return Result.ok(0);

      const query = exec
        .insert(alertWeeklyDigest)
        .values(
          digests.map(({ userId, dueAt, expiresAt }) => ({
            userId,
            weekStart,
            expiresAt,
            nextAttemptAt: dueAt,
          })),
        )
        .onConflictDoNothing({ target: [alertWeeklyDigest.weekStart, alertWeeklyDigest.userId] })
        .returning({ id: alertWeeklyDigest.id });
      const planned = await this.tracer.query(query);
      return Result.ok(planned.length);
    });
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedDigest[], AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("claimDue", async () => {
      const rows = await this.tracer.query(
        digestClaimQuery(exec, now, limit, leaseSeconds, this.claimScope),
      );
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
    return this.tracer.method("settle", async () => {
      const delivered =
        settlement.status === "sent"
          ? { channel: settlement.channel, sentAt: settlement.at }
          : { channel: null, sentAt: null };
      const query = exec
        .update(alertWeeklyDigest)
        .set({ status: settlement.status, ...delivered, nextAttemptAt: null })
        .where(fencedBy(lease))
        .returning({ id: alertWeeklyDigest.id });
      const updated = await this.tracer.query(query);
      return Result.ok(updated.length === 1);
    });
  }

  async addFailure(lease: DigestLease): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("addFailure", async () => {
      const query = exec
        .update(alertWeeklyDigest)
        .set({ failures: sql`${alertWeeklyDigest.failures} + 1` })
        .where(fencedBy(lease))
        .returning({ id: alertWeeklyDigest.id });
      const updated = await this.tracer.query(query);
      return Result.ok(updated.length === 1);
    });
  }

  async enabledFor(userId: string): Promise<Result<Option<boolean>, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("enabledFor", async () => {
      const query = exec
        .select({ enabled: alertDigestPreference.enabled })
        .from(alertDigestPreference)
        .where(eq(alertDigestPreference.userId, userId))
        .limit(1);
      const rows = await this.tracer.query(query);
      return Result.ok(Option.fromNullable(rows[0]).map(({ enabled }) => enabled));
    });
  }

  async saveEnabled(
    userId: string,
    enabled: boolean,
    at: Date,
  ): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("saveEnabled", async () => {
      const values = { enabled, updatedAt: at };
      const query = exec
        .insert(alertDigestPreference)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: alertDigestPreference.userId, set: values });
      await this.tracer.query(query);
      return Result.ok();
    });
  }
}
