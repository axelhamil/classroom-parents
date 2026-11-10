import type { IChildOwnership } from "@modules/agenda/application/ports/child-ownership.port";
import type { EventQueryService } from "@modules/agenda/application/services/event-query.service";
import type { IEventDeadlines } from "@modules/alerts/application/ports/event-deadlines.port";
import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";

export function childOwnershipFor(
  children: Pick<ChildConnectionService, "isOwnedBy">,
): IChildOwnership {
  return { isOwnedBy: (userId, childId) => children.isOwnedBy(userId, childId) };
}

export function eventDeadlinesFor(
  agenda: Pick<EventQueryService, "alertDeadline">,
): IEventDeadlines {
  return {
    forUser: async (userId, eventId) =>
      (await agenda.alertDeadline(userId, eventId)).map((found) =>
        found.map(({ deadlineAt, deadlineDate, deadlineTime, done }) => ({
          deadlineAt,
          deadlineDate,
          deadlineTime,
          done,
        })),
      ),
  };
}
