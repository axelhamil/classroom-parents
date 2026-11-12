import { DAY_MS } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import type { EventItem } from "../../shared/api/queries/events";
import { daysUntil, wallTimeNow } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";

export const WEEK_LENGTH = 7;

const EVENING_FROM = "16:00";
const GREETING_EVENING_FROM = "18:00";
const SUNDAY = 0;

export interface WeekDay {
  date: string;
  events: EventItem[];
}

export function weekDates(now: Date): string[] {
  const start = utcDay(schoolToday(now));

  return Array.from({ length: WEEK_LENGTH }, (_, offset) =>
    new Date(start + offset * DAY_MS).toISOString().slice(0, 10),
  );
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
  return new Date(utcDay(schoolToday(now))).getUTCDay() === SUNDAY && isEvening(now);
}

export function greetingKind(now: Date): "morning" | "evening" {
  return wallTimeNow(now) >= GREETING_EVENING_FROM ? "evening" : "morning";
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
