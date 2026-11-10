import type { AgendaEvent } from "../../domain/event.aggregate";
import type { PlannedDeadline } from "../ports/alert-planner.port";

export function plannedDeadline(event: AgendaEvent): PlannedDeadline {
  const deadline = event.get("deadline").value;

  return {
    eventId: event.id.value,
    userId: event.get("userId"),
    deadlineDate: deadline.date,
    deadlineTime: deadline.time,
  };
}
