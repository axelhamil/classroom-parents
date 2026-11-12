import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import type { IUpcomingAlerts } from "@modules/classroom-sync/application/ports/upcoming-alerts.port";
import { type AppError, type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, asc, dbOperationFailure, eq, gt, resolveExecutor } from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

export class UpcomingAlertsQuery implements IUpcomingAlerts {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async nextAlertAt(
    userId: string,
    childId: string,
    after: Date,
  ): Promise<Result<Option<Date>, AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan(
      { name: "UpcomingAlertsQuery > nextAlertAt" },
      async () => {
        try {
          const query = exec
            .select({ dueAt: alert.dueAt })
            .from(alert)
            .innerJoin(
              agendaEvent,
              and(eq(agendaEvent.id, alert.eventId), eq(agendaEvent.userId, alert.userId)),
            )
            .where(
              and(
                eq(alert.userId, userId),
                eq(agendaEvent.childId, childId),
                eq(alert.status, "pending"),
                gt(alert.dueAt, after),
              ),
            )
            .orderBy(asc(alert.dueAt))
            .limit(1);
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(Option.fromNullable(row?.dueAt));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(queryFailure("nextAlertAt", err));
        }
      },
    );
  }
}
