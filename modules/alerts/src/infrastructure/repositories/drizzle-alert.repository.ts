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
  lte,
  resolveExecutor,
  type SQL,
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

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

type AlertRow = typeof alert.$inferSelect;

function toDomain(row: AlertRow): Result<Alert, string> {
  const id = AlertId.parse(row.id);
  const time = AlertTime.fromInstant(row.dueAt);
  const origin = AlertOrigin.create(row.origin);
  const status = AlertStatus.create(row.status);
  if (id.isFailure) return Result.fail(id.getError());
  if (time.isFailure) return Result.fail(time.getError());
  if (origin.isFailure) return Result.fail(origin.getError());
  if (status.isFailure) return Result.fail(status.getError());

  return Result.ok(
    Alert.reconstitute(
      {
        eventId: row.eventId,
        userId: row.userId,
        time: time.getValue(),
        deadlineAt: row.deadlineAt,
        origin: origin.getValue(),
        status: status.getValue(),
        sentAt: Option.fromNullable(row.sentAt),
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
    attempts: 0,
    nextAttemptAt: null,
  };
}

export function alertClaimQuery(
  exec: ReturnType<typeof resolveExecutor>,
  now: Date,
  limit: number,
  leaseSeconds: number,
) {
  const due = db
    .select({ id: alert.id })
    .from(alert)
    .where(and(eq(alert.status, "pending"), lte(alert.dueAt, now), isDue(alert.nextAttemptAt)))
    .orderBy(asc(alert.dueAt))
    .limit(limit)
    .for("update", { skipLocked: true });

  return exec
    .update(alert)
    .set(claimedSet(alert, leaseSeconds))
    .where(inArray(alert.id, due))
    .returning();
}

export class DrizzleAlertRepository implements IAlertRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async findOwned(userId: string, eventId: string): Promise<Result<Option<Alert>, AlertsError>> {
    return this.findOne("findOwned", and(eq(alert.eventId, eventId), eq(alert.userId, userId)));
  }

  async findByEvent(eventId: string): Promise<Result<Option<Alert>, AlertsError>> {
    return this.findOne("findByEvent", eq(alert.eventId, eventId));
  }

  async save(entity: Alert): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "DrizzleAlertRepository > save" }, async () => {
      try {
        const columns = plannedColumns(entity);
        const query = exec
          .insert(alert)
          .values({
            id: entity.id.value,
            eventId: entity.get("eventId"),
            userId: entity.get("userId"),
            ...columns,
          })
          .onConflictDoUpdate({
            target: alert.eventId,
            set: columns,
            setWhere: eq(alert.userId, entity.get("userId")),
          })
          .returning({ id: alert.id });
        const written = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );
        if (written.length === 0)
          return Result.fail({ code: "ALERT_NOT_FOUND", message: "Cette alerte n'existe pas." });

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("save"));
      }
    });
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
          const query = alertClaimQuery(exec, now, limit, leaseSeconds);
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
              lease: { alertId: row.id, attempts: row.attempts },
            });
          }
          return Result.ok(claimed);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure("claimDue"));
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
          .where(
            and(
              leasedBy(alert, { id: lease.alertId, attempts: lease.attempts }),
              eq(alert.status, "pending"),
            ),
          )
          .returning({ id: alert.id });
        const updated = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(updated.length === 1);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(repositoryFailure("settle"));
      }
    });
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
          return Result.fail(repositoryFailure("recordDelivery"));
        }
      },
    );
  }

  private async findOne(
    method: string,
    where: SQL | undefined,
  ): Promise<Result<Option<Alert>, AlertsError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: `DrizzleAlertRepository > ${method}` },
      async () => {
        try {
          const query = exec.select().from(alert).where(where).limit(1).for("update");
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const row = rows[0];
          if (!row) return Result.ok(Option.none());

          const mapped = toDomain(row);
          if (mapped.isFailure) {
            this.instrumentation.capture(new Error(`alert ${row.id}: ${mapped.getError()}`));
            return Result.fail(repositoryFailure(method));
          }
          return Result.ok(Option.some(mapped.getValue()));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }
}
