import { daysFrom, isWeekday, mondayOf, shiftDate } from "@packages/ddd-kit/days";
import { wallTimeNow } from "../../shared/format/deadline-label";
import { schoolToday } from "../../shared/format/school-today";
import type { CalendarRange } from "./api/events.queries";

export const WEEK_LENGTH = 7;

const EVENING_FROM = "16:00";
const GREETING_EVENING_FROM = "18:00";
const DAYS_TO_NEXT_SCHOOL_DAY = [1, 2, 3] as const;

export const PRINT_WEEKS = ["current", "next"] as const;

export type PrintWeek = (typeof PRINT_WEEKS)[number];

export function defaultPrintWeek(now: Date): PrintWeek {
  const nextMonday = shiftDate(mondayOf(schoolToday(now)), WEEK_LENGTH);

  return schoolMoment(now).focus >= nextMonday ? "next" : "current";
}

export function printWeekDates(now: Date, week: PrintWeek): string[] {
  return daysFrom(
    shiftDate(mondayOf(schoolToday(now)), week === "current" ? 0 : WEEK_LENGTH),
    WEEK_LENGTH,
  );
}

function isEvening(now: Date): boolean {
  return wallTimeNow(now) >= EVENING_FROM;
}

export interface SchoolMoment {
  today: string;
  focus: string;
}

export function schoolMoment(now: Date): SchoolMoment {
  const today = schoolToday(now);
  if (isWeekday(today) && !isEvening(now)) return { today, focus: today };

  const focus =
    DAYS_TO_NEXT_SCHOOL_DAY.map((offset) => shiftDate(today, offset)).find(isWeekday) ??
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
