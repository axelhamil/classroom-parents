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

function periodStart(view: CalendarView, anchor: string): string {
  return view === "week" ? anchor : mondayOf(firstOfMonth(anchor));
}

const LENGTHS = {
  week: WEEK_DAYS,
  month: MONTH_GRID_DAYS,
} as const satisfies Record<CalendarView, number>;

export function calendarPeriod(view: CalendarView, anchor: string): CalendarPeriod {
  const days = daysFrom(periodStart(view, anchor), LENGTHS[view]);

  return { from: days[0] ?? anchor, to: days.at(-1) ?? anchor, days };
}

export interface CalendarPlace {
  view?: CalendarView;
  date?: string;
  courseId?: string;
}

export function placePeriod(place: CalendarPlace, { today }: Pick<SchoolClock, "today">) {
  const view = place.view ?? "week";
  const anchor = place.date ?? today;

  return { view, today, anchor, period: calendarPeriod(view, anchor) };
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

export function periodHolds(view: CalendarView, anchor: string, date: string): boolean {
  const { from, to } = calendarPeriod(view, anchor);
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
  const target = document.querySelector<HTMLElement>(`[data-jump="${date}"]`);
  target?.scrollIntoView?.({ block: "start" });
  target?.focus({ preventScroll: true });
}
