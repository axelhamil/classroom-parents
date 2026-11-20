import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import type {
  AlertContext,
  AlertDeadline,
  IAlertContextReader,
} from "@modules/alerts/application/ports/alert-context-reader.port";
import type { IParentTimeZone } from "@modules/alerts/application/ports/parent-time-zone.port";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE, todayIn } from "@packages/ddd-kit/zoned-time";
import {
  and,
  authSchema,
  dbOperationFailure,
  eq,
  inArray,
  not,
  resolveExecutor,
} from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

interface DeadlineRow {
  deadlineDate: string;
  deadlineTime: string | null;
}

/**
 * When a deadline falls for the parent reading the message: the school's wall date and time, and
 * the parent's today in their own zone, so "demain" means the parent's tomorrow.
 */
export function alertDeadlineOf(row: DeadlineRow, now: Date, timeZone: string): AlertDeadline {
  return {
    date: row.deadlineDate,
    time: row.deadlineTime?.slice(0, 5),
    today: todayIn(now, timeZone),
  };
}

export class AlertContextQuery implements IAlertContextReader {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly appOrigin: string,
    private readonly timeZones: IParentTimeZone,
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
            userId: alert.userId,
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
        const zones = await this.zonesOf(rows.map(({ userId }) => userId));

        return Result.ok(
          rows.map((row) => ({
            alertId: row.alertId,
            email: row.email,
            eventTitle: row.eventTitle,
            childLabel: row.childLabel,
            deadline: alertDeadlineOf(row, now, zones.get(row.userId) ?? PARIS_TIME_ZONE),
            eventUrl: new URL(`/events/${row.eventId}`, this.appOrigin).toString(),
          })),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("load", err));
      }
    });
  }

  private async zonesOf(userIds: string[]): Promise<Map<string, string>> {
    const parents = [...new Set(userIds)];
    const zones = await Promise.all(
      parents.map(async (userId) => [userId, await this.timeZones.of(userId)] as const),
    );

    return new Map(zones);
  }
}
