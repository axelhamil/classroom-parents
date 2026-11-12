import { alert } from "@modules/alerts/schemas/alert.schema";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, asc, dbOperationFailure, eq, inArray, resolveExecutor } from "@packages/drizzle";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const queryFailure = dbOperationFailure("CALENDAR_FEED_PROVIDER_FAILURE");

const RINGING_STATUSES = ["pending", "sent"] as const;

export class FeedAlarmsQuery {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async alarmsOf(
    userId: string,
    eventIds: string[],
  ): Promise<Result<Map<string, Date[]>, AppError>> {
    const exec = resolveExecutor();
    return this.instrumentation.startSpan({ name: "FeedAlarmsQuery > alarmsOf" }, async () => {
      if (eventIds.length === 0) return Result.ok(new Map());

      try {
        const query = exec
          .select({ eventId: alert.eventId, dueAt: alert.dueAt })
          .from(alert)
          .where(
            and(
              eq(alert.userId, userId),
              inArray(alert.eventId, eventIds),
              inArray(alert.status, [...RINGING_STATUSES]),
            ),
          )
          .orderBy(asc(alert.dueAt));
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        const byEvent = new Map<string, Date[]>();
        for (const { eventId, dueAt } of rows) {
          byEvent.set(eventId, [...(byEvent.get(eventId) ?? []), dueAt]);
        }
        return Result.ok(byEvent);
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(queryFailure("alarmsOf", err));
      }
    });
  }
}
