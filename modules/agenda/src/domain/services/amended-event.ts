import { Option } from "@packages/ddd-kit";
import type { AgendaEvent } from "../event.aggregate";
import type { EventAmendment } from "../value-objects/event-amendment.vo";
import { namesWork } from "./same-work";

export interface AmendingAnnouncement {
  announcementId: string;
  newDates: string[];
}

function untouchedEarlierAnnouncement(event: AgendaEvent, by: AmendingAnnouncement): boolean {
  return (
    event.get("source").value === "announcement" &&
    event.get("announcementId") !== by.announcementId &&
    event.get("deletedAt").isNone() &&
    event.get("withdrawnAt").isNone() &&
    event.get("editedFields").length === 0
  );
}

function onAmendedDay(
  event: AgendaEvent,
  amendment: EventAmendment,
  by: AmendingAnnouncement,
): boolean {
  const { kind, referenceDate } = amendment.value;
  const date = event.get("deadline").value.date;
  if (referenceDate !== undefined) return date === referenceDate;

  return kind === "cancelled" || !by.newDates.includes(date);
}

export function amendedEvent(
  candidates: AgendaEvent[],
  amendment: EventAmendment,
  by: AmendingAnnouncement,
): Option<AgendaEvent> {
  const targets = candidates.filter(
    (event) =>
      untouchedEarlierAnnouncement(event, by) &&
      onAmendedDay(event, amendment, by) &&
      namesWork(amendment.value.reference, event.get("title").value),
  );

  return Option.fromNullable(targets.length === 1 ? targets[0] : undefined);
}
