import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  type AnyPgColumn,
  and,
  asc,
  claimedSet,
  db,
  dbOperationFailure,
  eq,
  inArray,
  isDue,
  leasedBy,
  lockAllForTransaction,
  lte,
  or,
  resolveExecutor,
  type SQL,
  sql,
} from "@packages/drizzle";
import { alert, alertDelivery } from "../../../schemas/alert.schema";
import type {
  AlertDelivery,
  AlertLease,
  AlertsError,
  ClaimedAlert,
  IAlertRepository,
} from "../../application/ports/alert-repository.port";
import { Alert } from "../../domain/alert.aggregate";
import { AlertId } from "../../domain/alert-id";
import { AlertOrigin } from "../../domain/value-objects/alert-origin.vo";
import { AlertStatus } from "../../domain/value-objects/alert-status.vo";
import { AlertTime } from "../../domain/value-objects/alert-time.vo";
import { Reminder } from "../../domain/value-objects/reminder.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

type AlertRow = typeof alert.$inferSelect;

function toDomain(row: AlertRow): Result<Alert, string> {
  const id = AlertId.parse(row.id);
  const reminder = Reminder.fromKey(row.reminder);
  const time = AlertTime.fromInstant(row.dueAt);
  const origin = AlertOrigin.create(row.origin);
  const status = AlertStatus.create(row.status);
  if (id.isFailure) return Result.fail(id.getError());
  if (reminder.isFailure) return Result.fail(reminder.getError());
  if (time.isFailure) return Result.fail(time.getError());
  if (origin.isFailure) return Result.fail(origin.getError());
  if (status.isFailure) return Result.fail(status.getError());

  return Result.ok(
    Alert.reconstitute(
      {
        eventId: row.eventId,
        userId: row.userId,
        reminder: reminder.getValue(),
        time: time.getValue(),
        deadlineAt: row.deadlineAt,
        origin: origin.getValue(),
        status: status.getValue(),
        sentAt: Option.fromNullable(row.sentAt),
        version: row.version,
      },
      id.getValue(),
    ),
  );
}

function stateColumns(entity: Alert) {
  return {
    status: entity.get("status").value,
    sentAt: entity.get("sentAt").toNull(),
  };
}

function plannedColumns(entity: Alert) {
  return {
    ...stateColumns(entity),
    dueAt: entity.get("time").value.at,
    deadlineAt: entity.get("deadlineAt"),
    origin: entity.get("origin").value,
    version: entity.get("version"),
  };
}

function excluded(column: AnyPgColumn): SQL {
  return sql`excluded.${sql.identifier(column.name)}`;
}

function fencedBy(lease: AlertLease): SQL | undefined {
  return and(
    leasedBy(alert, { id: lease.alertId, attempts: lease.attempts }),
    eq(alert.version, lease.version),
    eq(alert.status, "pending"),
  );
}

const CLAIM_LOCK = "alert-claim:";

export function alertClaimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  now: Date,
  limit: number,
  leaseSeconds: number,
  scope?: SQL,
) {
  const ready = and(
    eq(alert.status, "pending"),
    lte(alert.dueAt, now),
    isDue(alert.nextAttemptAt),
    scope,
  );
  const parents = db
    .select({
      userId: alert.userId,
      due: sql<number>`count(*)::int`.as("due"),
      firstDue: sql<Date>`min(${alert.dueAt})`.as("first_due"),
    })
    .from(alert)
    .where(ready)
    .groupBy(alert.userId)
    .orderBy(sql`min(${alert.dueAt})`, alert.userId)
    .limit(limit)
    .as("parents");
  const queued = db
    .select({
      userId: parents.userId,
      place: sql<number>`row_number() over (order by ${parents.firstDue}, ${parents.userId})`.as(
        "place",
      ),
      upTo: sql<number>`sum(${parents.due}) over (order by ${parents.firstDue}, ${parents.userId})`.as(
        "up_to",
      ),
    })
    .from(parents)
    .as("queued");
  const whole = db
    .select({ userId: queued.userId })
    .from(queued)
    .where(
      and(
        or(eq(queued.place, 1), lte(queued.upTo, limit)),
        sql`pg_try_advisory_xact_lock(hashtextextended(${CLAIM_LOCK} || ${queued.userId}, 0))`,
      ),
    );
  const due = db
    .select({ id: alert.id })
    .from(alert)
    .where(and(ready, inArray(alert.userId, whole)))
    .for("update", { skipLocked: true });

  return exec
    .update(alert)
    .set(claimedSet(alert, leaseSeconds))
    .where(inArray(alert.id, due))
    .returning();
}

export class DrizzleAlertRepository implements IAlertRepository {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly claimScope?: SQL,
  ) {}

  async listOwned(userId: string, eventId: string): Promise<Result<Alert[], AlertsError>> {
    return this.selectMany("listOwned", and(eq(alert.eventId, eventId), eq(alert.userId, userId)));
  }

  async lockOwned(userId: string, eventId: string): Promise<Result<Alert[], AlertsError>> {
    return this.selectMany("lockOwned", and(eq(alert.eventId, eventId), eq(alert.userId, userId)), [
      eventId,
    ]);
  }

  async lockByEvent(eventId: string): Promise<Result<Alert[], AlertsError>> {
    return this.selectMany("lockByEvent", eq(alert.eventId, eventId), [eventId]);
  }

  async lockOwnedMany(userId: string, eventIds: string[]): Promise<Result<Alert[], AlertsError>> {
    if (eventIds.length === 0) return Result.ok([]);

    return this.selectMany(
      "lockOwnedMany",
      and(inArray(alert.eventId, eventIds), eq(alert.userId, userId)),
      eventIds,
    );
  }

  async saveMany(entities: Alert[]): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAlertRepository > saveMany" },
      async () => {
        try {
          if (entities.length === 0) return Result.ok();

          const query = exec
            .insert(alert)
            .values(
              entities.map((entity) => ({
                id: entity.id.value,
                eventId: entity.get("eventId"),
                userId: entity.get("userId"),
                reminder: entity.key(),
                ...plannedColumns(entity),
              })),
            )
            .onConflictDoUpdate({
              target: [alert.eventId, alert.reminder],
              set: {
                status: excluded(alert.status),
                sentAt: excluded(alert.sentAt),
                dueAt: excluded(alert.dueAt),
                deadlineAt: excluded(alert.deadlineAt),
                origin: excluded(alert.origin),
                version: excluded(alert.version),
                failures: sql`case when ${alert.version} = ${excluded(alert.version)} then ${alert.failures} else 0 end`,
              },
              setWhere: eq(alert.userId, excluded(alert.userId)),
            })
            .returning({ id: alert.id });
          const written = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          if (written.length !== entities.length)
            return Result.fail({ code: "ALERT_NOT_FOUND", message: "Cette alerte n'existe pas." });

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("saveMany", err));
        }
      },
    );
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedAlert[], AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAlertRepository > claimDue" },
      async () => {
        try {
          const query = alertClaimQuery(exec, now, limit, leaseSeconds, this.claimScope);
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const claimed: ClaimedAlert[] = [];
          for (const row of rows) {
            const mapped = toDomain(row);
            if (mapped.isFailure) {
              this.instrumentation.capture(new Error(`alert ${row.id}: ${mapped.getError()}`));
              continue;
            }
            claimed.push({
              alert: mapped.getValue(),
              lease: { alertId: row.id, attempts: row.attempts, version: row.version },
              failures: row.failures,
            });
          }
          return Result.ok(claimed);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("claimDue", err));
        }
      },
    );
  }

  async settle(entity: Alert, lease: AlertLease): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleAlertRepository > settle" }, async () => {
      try {
        const query = exec
          .update(alert)
          .set({ ...stateColumns(entity), nextAttemptAt: null })
          .where(fencedBy(lease))
          .returning({ id: alert.id });
        const updated = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(updated.length === 1);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("settle", err));
      }
    });
  }

  async addFailure(lease: AlertLease): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAlertRepository > addFailure" },
      async () => {
        try {
          const query = exec
            .update(alert)
            .set({ failures: sql`${alert.failures} + 1` })
            .where(fencedBy(lease))
            .returning({ id: alert.id });
          const updated = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(updated.length === 1);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("addFailure", err));
        }
      },
    );
  }

  async recordDelivery(delivery: AlertDelivery): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "DrizzleAlertRepository > recordDelivery" },
      async () => {
        try {
          const query = exec
            .insert(alertDelivery)
            .values(delivery)
            .onConflictDoUpdate({
              target: [alertDelivery.alertId, alertDelivery.channel],
              set: { outcome: delivery.outcome, at: delivery.at },
            });
          await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("recordDelivery", err));
        }
      },
    );
  }

  private async selectMany(
    method: string,
    where: SQL | undefined,
    lockedEvents?: string[],
  ): Promise<Result<Alert[], AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleAlertRepository > ${method}` },
      async () => {
        try {
          if (lockedEvents)
            await lockAllForTransaction(lockedEvents.map((eventId) => `alert-plan:${eventId}`));
          const read = exec
            .select()
            .from(alert)
            .where(where)
            .orderBy(asc(alert.eventId), asc(alert.dueAt));
          const query = lockedEvents ? read.for("update") : read;
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          const alerts: Alert[] = [];
          for (const row of rows) {
            const mapped = toDomain(row);
            if (mapped.isFailure) {
              const corrupt = new Error(`alert ${row.id}: ${mapped.getError()}`);
              this.instrumentation.capture(corrupt);
              return Result.fail(repositoryFailure(method, corrupt));
            }
            alerts.push(mapped.getValue());
          }
          return Result.ok(alerts);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method, err));
        }
      },
    );
  }
}
