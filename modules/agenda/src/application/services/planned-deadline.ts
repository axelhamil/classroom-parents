import type { AgendaEvent } from "../../domain/event.aggregate";
import type { PlannedDeadline } from "../ports/alert-planner.port";

export function plannedDeadline(event: AgendaEvent, actorUserId: string | null): PlannedDeadline {
  return { eventId: event.id.value, userId: event.get("userId"), actorUserId };
}
