import type { EventItem } from "../../shared/api/queries/events";
import type { EventCategory } from "../../shared/events/event-labels";

export const CHECKLIST_DEFAULTS = {
  swimming: [
    "prepare.items.swimming.swimsuit",
    "prepare.items.swimming.cap",
    "prepare.items.swimming.towel",
    "prepare.items.swimming.showerGel",
  ],
  school_trip: [
    "prepare.items.school_trip.lunch",
    "prepare.items.school_trip.outfit",
    "prepare.items.school_trip.permission",
  ],
  document_due: ["prepare.items.document_due.sign", "prepare.items.document_due.pack"],
  assessment: ["prepare.items.assessment.revise"],
  homework: ["prepare.items.homework.check"],
  other: [],
} as const satisfies Record<EventCategory, readonly string[]>;

type StepsOf = Pick<EventItem, "category" | "checklist">;

export function stepIdsOf({ category, checklist }: StepsOf): string[] {
  const defaults = CHECKLIST_DEFAULTS[category].filter((key) => !checklist.removed.includes(key));

  return [...defaults, ...checklist.extra.map((item) => item.id)];
}

export function hasOpenSteps(event: StepsOf): boolean {
  return stepIdsOf(event).some((id) => !event.checklist.done.includes(id));
}
