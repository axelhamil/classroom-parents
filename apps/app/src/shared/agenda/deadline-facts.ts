import type { EventItem } from "../api/queries/events";
import type { EventCategory } from "../events/event-labels";
import type { DateRange } from "./windows";

/** What every fact about one deadline reads. */
export type Deadline = Pick<EventItem, "childId" | "category" | "deadlineDate" | "done" | "status">;

/**
 * Open means not ticked done. A date still to check counts as open everywhere in the app, with its
 * review mark: hiding it would hide a deadline the parent may well have. Alerts are the one place
 * that waits for a confirmed date, on the server.
 */
export function isOpen(event: Pick<Deadline, "done">): boolean {
  return !event.done;
}

export function needsReview(event: Pick<Deadline, "status">): boolean {
  return event.status === "needs_review";
}

export function isDueOn(event: Pick<Deadline, "deadlineDate">, day: string): boolean {
  return event.deadlineDate === day;
}

export function isDueWithin(
  event: Pick<Deadline, "deadlineDate">,
  { from, to }: DateRange,
): boolean {
  return event.deadlineDate >= from && event.deadlineDate <= to;
}

export function isOverdue(event: Pick<Deadline, "done" | "deadlineDate">, today: string): boolean {
  return isOpen(event) && event.deadlineDate < today;
}

export function isOfChild(event: Pick<Deadline, "childId">, childId: string | null): boolean {
  return childId === null || event.childId === childId;
}

export function isOfKind(event: Pick<Deadline, "category">, kinds: readonly EventCategory[]) {
  return kinds.includes(event.category);
}

type Instant = Pick<EventItem, "deadlineAt">;

/** Soonest first, to the minute. */
export function bySoonest(left: Instant, right: Instant): number {
  return left.deadlineAt.localeCompare(right.deadlineAt);
}
