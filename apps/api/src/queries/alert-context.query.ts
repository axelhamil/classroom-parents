import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import type {
  AlertContext,
  IAlertContextReader,
} from "@modules/alerts/application/ports/alert-context-reader.port";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  dbOperationFailure,
  eq,
  inArray,
  resolveExecutor,
} from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

function deadlineLabel(date: string, time: string | null): string {
  const day = dayFormat.format(new Date(`${date}T12:00:00.000Z`));
  if (!time) return day;

  return `${day} à ${time.slice(0, 2)}h${time.slice(3, 5)}`;
}

export class AlertContextQuery implements IAlertContextReader {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly appOrigin: string,
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
            and(eq(childAccount.id, agendaEvent.childId), eq(childAccount.userId, alert.userId)),
          )
          .innerJoin(authSchema.user, eq(authSchema.user.id, alert.userId))
          .where(inArray(alert.id, alertIds));
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(
          rows.map((row) => ({
            alertId: row.alertId,
            email: row.email,
            eventTitle: row.eventTitle,
            childLabel: row.childLabel,
            deadlineLabel: deadlineLabel(row.deadlineDate, row.deadlineTime),
            eventUrl: new URL(`/events/${row.eventId}`, this.appOrigin).toString(),
          })),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("load"));
      }
    });
  }
}
