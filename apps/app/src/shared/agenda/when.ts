import type { EventItem } from "../api/queries/events";
import { daysBetween } from "../format/deadline-label";
import { SCHOOL_DAY_ENDS_AT, type SchoolClock } from "./school-clock";

const MORNING_UNTIL = "12:00";

/** How far ahead a deadline still reads as "in N days"; past it, only its date is written. */
export const RELATIVE_HORIZON_DAYS = 6;

export type WhenBadge =
  | { kind: "tonight" | "tomorrowMorning" | "today" | "tomorrow"; tone: "urgent" }
  | { kind: "inDays"; days: number; tone: "soon" };

/**
 * One deadline's "when", written once: `date` is null when the badge already says the day (or the
 * row sits under its day heading), `time` appears once, `badge` never repeats either of them.
 */
export interface When {
  date: string | null;
  time: string | null;
  badge: WhenBadge | null;
}

export interface WhenOptions {
  dated: boolean;
  withBadge?: boolean;
}

type DeadlineWhen = Pick<EventItem, "deadlineDate" | "deadlineTime" | "done">;

function isPast(days: number, time: string | undefined, clock: SchoolClock): boolean {
  return days < 0 || (days === 0 && time !== undefined && time <= clock.time);
}

function badgeOf(
  { deadlineDate, deadlineTime }: DeadlineWhen,
  clock: SchoolClock,
): WhenBadge | null {
  const days = daysBetween(clock.today, deadlineDate);
  if (isPast(days, deadlineTime, clock) || days > RELATIVE_HORIZON_DAYS) return null;
  if (days === 0)
    return {
      kind: deadlineTime !== undefined && deadlineTime >= SCHOOL_DAY_ENDS_AT ? "tonight" : "today",
      tone: "urgent",
    };
  if (days === 1)
    return {
      kind:
        deadlineTime !== undefined && deadlineTime < MORNING_UNTIL ? "tomorrowMorning" : "tomorrow",
      tone: "urgent",
    };

  return { kind: "inDays", days, tone: "soon" };
}

function undatedBadge(badge: WhenBadge | null): WhenBadge | null {
  return badge?.kind === "today" || badge?.kind === "tomorrow" ? null : badge;
}

/**
 * When a deadline falls, relative to the clock. A dated line writes either an urgent word
 * ("Ce soir", "Demain matin") or the date, never both; a line under its day heading only adds
 * what the heading does not say. A ticked deadline carries no badge; without a badge the date is
 * always written.
 */
export function whenOf(
  event: DeadlineWhen,
  clock: SchoolClock,
  { dated, withBadge = true }: WhenOptions,
): When {
  const badge = event.done || !withBadge ? null : badgeOf(event, clock);
  const time = event.deadlineTime ?? null;
  if (!dated) return { date: null, time, badge: undatedBadge(badge) };
  if (badge?.tone === "urgent") return { date: null, time, badge };

  return { date: event.deadlineDate, time, badge: null };
}
