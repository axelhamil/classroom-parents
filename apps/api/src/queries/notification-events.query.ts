import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import type {
  EventSummary,
  IEventSummaries,
} from "@modules/notifications/application/ports/event-summaries.port";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import {
  and,
  dbOperationFailure,
  eq,
  inArray,
  isNull,
  repositoryTracer,
  resolveExecutor,
} from "@packages/drizzle";
import { z } from "zod";

const eventId = z.uuid();

/** The title and the child of the events a page of notifications points at, owner in the `WHERE`. */
export class NotificationEventsQuery implements IEventSummaries {
  private readonly trace;

  constructor(instrumentation: IInstrumentation) {
    this.trace = repositoryTracer<AppError>(
      instrumentation,
      "NotificationEventsQuery",
      dbOperationFailure("NOTIFICATIONS_PROVIDER_FAILURE"),
    );
  }

  async summariesOf(
    userId: string,
    eventIds: string[],
  ): Promise<Result<Map<string, EventSummary>, AppError>> {
    const exec = resolveExecutor();
    return this.trace.method("summariesOf", async () => {
      const ids = eventIds.filter((id) => eventId.safeParse(id).success);
      if (ids.length === 0) return Result.ok(new Map());

      const rows = await this.trace.query(
        exec
          .select({ id: agendaEvent.id, title: agendaEvent.title, childId: agendaEvent.childId })
          .from(agendaEvent)
          .where(
            and(
              eq(agendaEvent.userId, userId),
              inArray(agendaEvent.id, ids),
              isNull(agendaEvent.deletedAt),
            ),
          ),
      );
      return Result.ok(new Map(rows.map(({ id, title, childId }) => [id, { title, childId }])));
    });
  }
}
