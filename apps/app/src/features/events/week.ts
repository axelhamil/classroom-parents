import { DAY_MS } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import type { EventItem } from "../../shared/api/queries/events";
import { daysUntil, wallTimeNow } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";

export const WEEK_LENGTH = 7;

const EVENING_FROM = "16:00";
const GREETING_EVENING_FROM = "18:00";
const SUNDAY = 0;
const FRIDAY = 5;
const SATURDAY = 6;

export const PRINT_WEEKS = ["current", "next"] as const;

export type PrintWeek = (typeof PRINT_WEEKS)[number];

export interface WeekDay {
  date: string;
  events: EventItem[];
}

function datesFrom(start: number, length: number): string[] {
  return Array.from({ length }, (_, offset) =>
    new Date(start + offset * DAY_MS).toISOString().slice(0, 10),
  );
}

function mondayOfWeek(now: Date): number {
  const daysSinceMonday = (weekdayOf(now) + WEEK_LENGTH - 1) % WEEK_LENGTH;

  return utcDay(schoolToday(now)) - daysSinceMonday * DAY_MS;
}

export function mondayOf(now: Date): string {
  return new Date(mondayOfWeek(now)).toISOString().slice(0, 10);
}

export function weekDates(now: Date): string[] {
  return datesFrom(utcDay(schoolToday(now)), WEEK_LENGTH);
}

export function upcomingWeekRange(now: Date): { from: string; to: string } {
  const from = schoolToday(now);

  return { from, to: weekDates(now).at(-1) ?? from };
}

function weekdayOf(now: Date): number {
  return new Date(utcDay(schoolToday(now))).getUTCDay();
}

export function defaultPrintWeek(now: Date): PrintWeek {
  const weekday = weekdayOf(now);
  const weekIsOver =
    weekday === SATURDAY || weekday === SUNDAY || (weekday === FRIDAY && isEvening(now));

  return weekIsOver ? "next" : "current";
}

export function printWeekDates(now: Date, week: PrintWeek): string[] {
  const monday = mondayOfWeek(now);

  return datesFrom(week === "current" ? monday : monday + WEEK_LENGTH * DAY_MS, WEEK_LENGTH);
}

export function isInWeek(date: string, now: Date): boolean {
  const days = daysUntil(date, now);

  return days >= 0 && days < WEEK_LENGTH;
}

export function weekOf(events: readonly EventItem[], now: Date): WeekDay[] {
  return weekDates(now).map((date) => ({
    date,
    events: events.filter((event) => event.deadlineDate === date),
  }));
}

export function isEvening(now: Date): boolean {
  return wallTimeNow(now) >= EVENING_FROM;
}

export function isSundayEvening(now: Date): boolean {
  return weekdayOf(now) === SUNDAY && isEvening(now);
}

export function greetingKind(now: Date): "morning" | "evening" {
  return wallTimeNow(now) >= GREETING_EVENING_FROM ? "evening" : "morning";
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
