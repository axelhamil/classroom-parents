import { shiftDate } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import type { EventItem } from "../../shared/api/queries/events";
import type { CalendarRange } from "./api/events.queries";

export const CALENDAR_VIEWS = ["week", "month"] as const;

export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const WEEK_DAYS = 7;
const MONTH_GRID_DAYS = 42;
const CRUNCH_FROM = 3;
export const OVERDUE_WINDOW_DAYS = 14;

export interface CalendarPeriod {
  from: string;
  to: string;
  days: string[];
}

export interface CalendarDay {
  date: string;
  events: EventItem[];
}

type Deadline = Pick<EventItem, "done" | "deadlineDate">;

function daysFrom(start: string, length: number): string[] {
  return Array.from({ length }, (_, offset) => shiftDate(start, offset));
}

function mondayOfDate(date: string): string {
  const weekday = new Date(utcDay(date)).getUTCDay();

  return shiftDate(date, -((weekday + WEEK_DAYS - 1) % WEEK_DAYS));
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function periodStart(view: CalendarView, anchor: string): string {
  return view === "week" ? anchor : mondayOfDate(firstOfMonth(anchor));
}

const LENGTHS = {
  week: WEEK_DAYS,
  month: MONTH_GRID_DAYS,
} as const satisfies Record<CalendarView, number>;

export function calendarPeriod(view: CalendarView, anchor: string): CalendarPeriod {
  const days = daysFrom(periodStart(view, anchor), LENGTHS[view]);

  return { from: days[0] ?? anchor, to: days.at(-1) ?? anchor, days };
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

export function isCrunchDay(date: string, events: readonly Deadline[], today: string): boolean {
  if (date < today) return false;

  return events.filter((event) => !event.done).length >= CRUNCH_FROM;
}

export function overdueWindow(today: string): CalendarRange {
  return { from: shiftDate(today, -OVERDUE_WINDOW_DAYS), to: shiftDate(today, -1) };
}

export function isOverdue(event: Deadline, today: string): boolean {
  return !event.done && event.deadlineDate < today;
}

export type DayTone = "today" | "past" | "default";

export function dayTone(date: string, today: string): DayTone {
  if (date === today) return "today";

  return date < today ? "past" : "default";
}

export function jumpToDay(date: string): void {
  const target = document.querySelector<HTMLElement>(`[data-jump="${date}"]`);
  target?.scrollIntoView?.({ block: "start" });
  target?.focus({ preventScroll: true });
}
