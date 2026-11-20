import { daysFrom, mondayOf, shiftDate } from "@packages/ddd-kit/days";
import type { SchoolClock } from "../../shared/agenda/school-clock";
import type { EventItem } from "../../shared/api/queries/events";

export const CALENDAR_VIEWS = ["week", "month"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const WEEK_DAYS = 7;
const MONTH_GRID_DAYS = 42;

export interface CalendarPeriod {
  from: string;
  to: string;
  days: string[];
}

export interface CalendarDay {
  date: string;
  events: EventItem[];
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Where a week starts: the thread of a phone reads the seven days from its anchor on, the planner
 * of a wider block reads the school week, Monday to Sunday, so its weekend is never cut in two.
 */
export type WeekStart = "anchor" | "monday";

function periodStart(view: CalendarView, anchor: string, weekStart: WeekStart): string {
  if (view === "month") return mondayOf(firstOfMonth(anchor));

  return weekStart === "monday" ? mondayOf(anchor) : anchor;
}

const LENGTHS = {
  week: WEEK_DAYS,
  month: MONTH_GRID_DAYS,
} as const satisfies Record<CalendarView, number>;

export function calendarPeriod(
  view: CalendarView,
  anchor: string,
  weekStart: WeekStart = "anchor",
): CalendarPeriod {
  const days = daysFrom(periodStart(view, anchor, weekStart), LENGTHS[view]);

  return { from: days[0] ?? anchor, to: days.at(-1) ?? anchor, days };
}

export interface CalendarPlace {
  view?: CalendarView;
  date?: string;
  courseId?: string;
}

export function placePeriod(
  place: CalendarPlace,
  { today }: Pick<SchoolClock, "today">,
  weekStart: WeekStart = "anchor",
) {
  const view = place.view ?? "week";
  const anchor = place.date ?? today;

  return { view, today, anchor, period: calendarPeriod(view, anchor, weekStart) };
}

function shiftMonth(anchor: string, step: 1 | -1): string {
  const [year = 0, month = 1] = anchor.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + step, 1));

  return shifted.toISOString().slice(0, 10);
}

export function shiftAnchor(view: CalendarView, anchor: string, step: 1 | -1): string {
  if (view === "month") return shiftMonth(anchor, step);

  return shiftDate(anchor, step * LENGTHS[view]);
}

export function periodHolds(
  view: CalendarView,
  anchor: string,
  date: string,
  weekStart: WeekStart = "anchor",
): boolean {
  const { from, to } = calendarPeriod(view, anchor, weekStart);
  const inRange = date >= from && date <= to;

  return view === "month" ? inRange && date.slice(0, 7) === anchor.slice(0, 7) : inRange;
}

export function daysOf(period: CalendarPeriod, events: readonly EventItem[]): CalendarDay[] {
  return period.days.map((date) => ({
    date,
    events: events.filter((event) => event.deadlineDate === date),
  }));
}

export function jumpToDay(date: string): void {
  const target = document.querySelector<HTMLElement>(`[data-jump~="${date}"]`);
  target?.scrollIntoView?.({ block: "start" });
  target?.focus({ preventScroll: true });
}
