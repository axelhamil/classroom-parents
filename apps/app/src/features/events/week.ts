import { DAY_MS, shiftDate } from "@packages/ddd-kit/days";
import { utcDay } from "@packages/i18n";
import { wallTimeNow } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import type { CalendarRange } from "./api/events.queries";

export const WEEK_LENGTH = 7;

const EVENING_FROM = "16:00";
const GREETING_EVENING_FROM = "18:00";
const SUNDAY = 0;
const SATURDAY = 6;
const DAYS_TO_NEXT_SCHOOL_DAY = [1, 2, 3] as const;

export const PRINT_WEEKS = ["current", "next"] as const;

export type PrintWeek = (typeof PRINT_WEEKS)[number];

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

function weekdayOf(now: Date): number {
  return new Date(utcDay(schoolToday(now))).getUTCDay();
}

export function defaultPrintWeek(now: Date): PrintWeek {
  const nextMonday = shiftDate(mondayOf(now), WEEK_LENGTH);

  return schoolMoment(now).focus >= nextMonday ? "next" : "current";
}

export function printWeekDates(now: Date, week: PrintWeek): string[] {
  const monday = mondayOfWeek(now);

  return datesFrom(week === "current" ? monday : monday + WEEK_LENGTH * DAY_MS, WEEK_LENGTH);
}

function isEvening(now: Date): boolean {
  return wallTimeNow(now) >= EVENING_FROM;
}

function isSchoolDay(date: string): boolean {
  const weekday = new Date(utcDay(date)).getUTCDay();

  return weekday !== SATURDAY && weekday !== SUNDAY;
}

export interface SchoolMoment {
  today: string;
  focus: string;
}

export function schoolMoment(now: Date): SchoolMoment {
  const today = schoolToday(now);
  if (isSchoolDay(today) && !isEvening(now)) return { today, focus: today };

  const focus =
    DAYS_TO_NEXT_SCHOOL_DAY.map((offset) => shiftDate(today, offset)).find(isSchoolDay) ??
    shiftDate(today, 1);

  return { today, focus };
}

export function weekAhead(today: string): CalendarRange {
  return { from: today, to: shiftDate(today, WEEK_LENGTH - 1) };
}

export function greetingKind(now: Date): "morning" | "evening" {
  return wallTimeNow(now) >= GREETING_EVENING_FROM ? "evening" : "morning";
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
