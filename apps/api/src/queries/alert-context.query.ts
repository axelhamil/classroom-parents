import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import type {
  AlertContext,
  IAlertContextReader,
} from "@modules/alerts/application/ports/alert-context-reader.port";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import {
  and,
  authSchema,
  dbOperationFailure,
  eq,
  inArray,
  not,
  resolveExecutor,
} from "@packages/drizzle";
import { wallDateLabel, withWallTime } from "@packages/i18n";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

function deadlineLabel(date: string, time: string | null, now: Date): string {
  const today = utcToZonedWall(now, PARIS_TIME_ZONE)
    .map((wall) => wall.date)
    .unwrapOr(date);

  return withWallTime(wallDateLabel(date, today), time?.slice(0, 5));
}

export class AlertContextQuery implements IAlertContextReader {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly appOrigin: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async load(alertIds: string[]): Promise<Result<AlertContext[], AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "AlertContextQuery > load" }, async () => {
      if (alertIds.length === 0) return Result.ok([]);

      try {
        const query = exec
          .select({
            alertId: alert.id,
            eventId: agendaEvent.id,
            email: authSchema.user.email,
            eventTitle: agendaEvent.title,
            childLabel: childAccount.label,
            deadlineDate: agendaEvent.deadlineDate,
            deadlineTime: agendaEvent.deadlineTime,
          })
          .from(alert)
          .innerJoin(
            agendaEvent,
            and(eq(agendaEvent.id, alert.eventId), eq(agendaEvent.userId, alert.userId)),
          )
          .innerJoin(
            childAccount,
            and(
              eq(childAccount.id, agendaEvent.childId),
              eq(childAccount.userId, alert.userId),
              not(eq(childAccount.status, "disconnecting")),
            ),
          )
          .innerJoin(authSchema.user, eq(authSchema.user.id, alert.userId))
          .where(inArray(alert.id, alertIds));
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        const now = this.clock();
        return Result.ok(
          rows.map((row) => ({
            alertId: row.alertId,
            email: row.email,
            eventTitle: row.eventTitle,
            childLabel: row.childLabel,
            deadlineLabel: deadlineLabel(row.deadlineDate, row.deadlineTime, now),
            eventUrl: new URL(`/events/${row.eventId}`, this.appOrigin).toString(),
          })),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("load", err));
      }
    });
  }
}
