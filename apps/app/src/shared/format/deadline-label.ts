import { DAY_MS } from "@packages/ddd-kit/days";
import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { relativeDayLabel, utcDay, wallDateLabel, withWallTime } from "@packages/i18n";

const LOCALE = "fr-FR";

export interface ZonedToday {
  today: string;
  timeZone: string;
}

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

export function inSentence(label: string): string {
  return label.toLocaleLowerCase(LOCALE);
}

export function daysBetween(today: string, date: string): number {
  return Math.round((utcDay(date) - utcDay(today)) / DAY_MS);
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

export function dayLabel(date: string, today: string): string {
  return relativeDayLabel(date, today);
}

export function deadlineLabel(
  deadlineDate: string,
  deadlineTime: string | undefined,
  today: string,
): string {
  return withWallTime(dayLabel(deadlineDate, today), deadlineTime);
}

export function zonedDay(instant: string, timeZone: string): string {
  const wall = utcToZonedWall(new Date(instant), timeZone);

  return wall.isSuccess ? wall.getValue().date : instant.slice(0, 10);
}

export function instantLabel(instant: string, { today, timeZone }: ZonedToday): string {
  const wall = utcToZonedWall(new Date(instant), timeZone);
  if (wall.isFailure) return instant;

  return deadlineLabel(wall.getValue().date, wall.getValue().time, today);
}
