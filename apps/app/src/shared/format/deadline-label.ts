import { DAY_MS } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { frCatalog, utcDay, wallDateLabel, withWallTime } from "@packages/i18n";
import { schoolToday } from "./school-today";

const LOCALE = "fr-FR";
const copy = frCatalog.common.deadline;

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

export function daysUntil(deadlineDate: string, now: Date): number {
  return Math.round((utcDay(deadlineDate) - utcDay(schoolToday(now))) / DAY_MS);
}

export interface WallDateParts {
  day: string;
  month: string;
  weekday: string;
}

export function wallDateParts(date: string): WallDateParts {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(utcDay(date));

  return {
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
  };
}

function dayLabel(date: string, now: Date): string {
  const daysAhead = daysUntil(date, now);
  if (daysAhead === 0) return copy.today;
  if (daysAhead === 1) return copy.tomorrow;

  return capitalize(wallDateLabel(date, schoolToday(now)));
}

export function deadlineLabel(
  deadlineDate: string,
  deadlineTime: string | undefined,
  now: Date,
): string {
  return withWallTime(dayLabel(deadlineDate, now), deadlineTime);
}

export function instantLabel(instant: string, now: Date): string {
  const wall = utcToZonedWall(new Date(instant), PARIS_TIME_ZONE);
  if (wall.isFailure) return instant;

  return deadlineLabel(wall.getValue().date, wall.getValue().time, now);
}
