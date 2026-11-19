import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  asc,
  claimedSet,
  db,
  eq,
  inArray,
  isDue,
  isNull,
  leasedBy,
  lte,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import { alertAccessLoss } from "../../../schemas/access-loss.schema";
import type {
  AccessLossChild,
  AccessLossLease,
  AccessLossSettlement,
  ClaimedAccessLoss,
  ClosedAccessLoss,
  IAccessLossRepository,
} from "../../application/ports/access-loss-repository.port";
import type { AlertsError } from "../../application/ports/alert-repository.port";
import { type RepositoryTracer, repositoryTracer } from "./repository-tracer";

const stillOpen = isNull(alertAccessLoss.closedAt);

function fencedBy(lease: AccessLossLease): SQL | undefined {
  return and(
    leasedBy(alertAccessLoss, { id: lease.accessAlertId, attempts: lease.attempts }),
    eq(alertAccessLoss.status, "pending"),
  );
}

function settledSet(settlement: AccessLossSettlement) {
  if (settlement.status === "sent")
    return { status: settlement.status, channel: settlement.channel, sentAt: settlement.at };
  if (settlement.status === "cancelled")
    return { status: settlement.status, closedAt: settlement.at };

  return { status: settlement.status };
}

export function accessLossClaimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  now: Date,
  limit: number,
  leaseSeconds: number,
  scope?: SQL,
) {
  const due = db
    .select({ id: alertAccessLoss.id })
    .from(alertAccessLoss)
    .where(
      and(
        eq(alertAccessLoss.status, "pending"),
        lte(alertAccessLoss.dueAt, now),
        isDue(alertAccessLoss.nextAttemptAt),
        scope,
      ),
    )
    .orderBy(asc(alertAccessLoss.dueAt))
    .limit(limit)
    .for("update", { skipLocked: true });

  return exec
    .update(alertAccessLoss)
    .set(claimedSet(alertAccessLoss, leaseSeconds))
    .where(inArray(alertAccessLoss.id, due))
    .returning();
}

export class DrizzleAccessLossRepository implements IAccessLossRepository {
  private readonly tracer: RepositoryTracer;

  constructor(
    instrumentation: IInstrumentation,
    private readonly claimScope?: SQL,
  ) {
    this.tracer = repositoryTracer(instrumentation, "DrizzleAccessLossRepository");
  }

  async open(child: AccessLossChild, dueAt: Date): Promise<Result<Option<string>, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("open", async () => {
      const query = exec
        .insert(alertAccessLoss)
        .values({ userId: child.userId, childId: child.childId, dueAt })
        .onConflictDoNothing({ target: alertAccessLoss.childId, where: stillOpen })
        .returning({ id: alertAccessLoss.id });
      const opened = await this.tracer.query(query);
      return Result.ok(Option.fromNullable(opened[0]).map(({ id }) => id));
    });
  }

  async close(child: AccessLossChild, at: Date): Promise<Result<ClosedAccessLoss[], AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("close", async () => {
      const wasPending = sql<boolean>`${alertAccessLoss.status} = 'pending'`;
      const query = exec
        .update(alertAccessLoss)
        .set({
          closedAt: at,
          status: sql`case when ${wasPending} then 'cancelled' else ${alertAccessLoss.status} end`,
          nextAttemptAt: null,
        })
        .where(
          and(
            eq(alertAccessLoss.childId, child.childId),
            eq(alertAccessLoss.userId, child.userId),
            stillOpen,
          ),
        )
        .returning({ id: alertAccessLoss.id, status: alertAccessLoss.status });
      const closed = await this.tracer.query(query);
      return Result.ok(
        closed.map(({ id, status }) => ({ accessAlertId: id, cancelled: status === "cancelled" })),
      );
    });
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedAccessLoss[], AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("claimDue", async () => {
      const rows = await this.tracer.query(
        accessLossClaimQuery(exec, now, limit, leaseSeconds, this.claimScope),
      );
      return Result.ok(
        rows.map((row) => ({
          lease: { accessAlertId: row.id, attempts: row.attempts },
          userId: row.userId,
          childId: row.childId,
          failures: row.failures,
        })),
      );
    });
  }

  async settle(
    lease: AccessLossLease,
    settlement: AccessLossSettlement,
  ): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("settle", async () => {
      const query = exec
        .update(alertAccessLoss)
        .set({ ...settledSet(settlement), nextAttemptAt: null })
        .where(fencedBy(lease))
        .returning({ id: alertAccessLoss.id });
      const updated = await this.tracer.query(query);
      return Result.ok(updated.length === 1);
    });
  }

  async addFailure(lease: AccessLossLease): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.tracer.method("addFailure", async () => {
      const query = exec
        .update(alertAccessLoss)
        .set({ failures: sql`${alertAccessLoss.failures} + 1` })
        .where(fencedBy(lease))
        .returning({ id: alertAccessLoss.id });
      const updated = await this.tracer.query(query);
      return Result.ok(updated.length === 1);
    });
  }
}
