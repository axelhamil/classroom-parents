import { DAY_MS } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { frCatalog, utcDay, wallDateLabel, withWallTime } from "@packages/i18n";
import { schoolToday } from "./school-today";

const LOCALE = "fr-FR";
const copy = frCatalog.common.deadline;

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

export function inSentence(label: string): string {
  return label.toLocaleLowerCase(LOCALE);
}

export function daysBetween(today: string, date: string): number {
  return Math.round((utcDay(date) - utcDay(today)) / DAY_MS);
}

export function daysUntil(deadlineDate: string, now: Date): number {
  return daysBetween(schoolToday(now), deadlineDate);
}

export interface WallDateParts {
  day: string;
  month: string;
  weekday: string;
  weekdayLong: string;
}

export function wallDateParts(date: string): WallDateParts {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: "UTC" }).format(utcDay(date));

  return {
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
    weekday: part({ weekday: "short" }),
    weekdayLong: part({ weekday: "long" }),
  };
}

/** "Vendredi 20 novembre": the whole date a day's heading is named by, whatever today is. */
export function fullDateLabel(date: string): string {
  return capitalize(wallDateLabel(date, date));
}

export function dayLabelFrom(date: string, today: string): string {
  const daysAhead = daysBetween(today, date);
  if (daysAhead === 0) return copy.today;
  if (daysAhead === 1) return copy.tomorrow;

  return capitalize(wallDateLabel(date, today));
}

export function dayLabel(date: string, now: Date): string {
  return dayLabelFrom(date, schoolToday(now));
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
