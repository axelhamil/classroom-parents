import { daysFrom, mondayOf, shiftDate } from "@packages/ddd-kit/days";
import { schoolClock } from "../../shared/agenda/school-clock";

const WEEK_LENGTH = 7;

export const PRINT_WEEKS = ["current", "next"] as const;

export type PrintWeek = (typeof PRINT_WEEKS)[number];

export function defaultPrintWeek(now: Date): PrintWeek {
  const { today, focus } = schoolClock(now);
  const nextMonday = shiftDate(mondayOf(today), WEEK_LENGTH);

  return focus >= nextMonday ? "next" : "current";
}

export function printWeekDates(now: Date, week: PrintWeek): string[] {
  return daysFrom(
    shiftDate(mondayOf(schoolClock(now).today), week === "current" ? 0 : WEEK_LENGTH),
    WEEK_LENGTH,
  );
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
