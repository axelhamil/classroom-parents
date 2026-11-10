import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { frCatalog } from "@packages/i18n";
import { SCHOOL_TIME_ZONE, schoolToday } from "./school-today";

const LOCALE = "fr-FR";
const DAY_MS = 86_400_000;
const copy = frCatalog.common.deadline;

type Placeholders<Template extends string> =
  Template extends `${string}{{${infer Name}}}${infer Rest}` ? Name | Placeholders<Rest> : never;

function fill<Template extends string>(
  template: Template,
  values: Record<Placeholders<Template>, string>,
): string {
  const byName: Record<string, string> = values;

  return template.replace(/{{(\w+)}}/g, (match, name: string) => byName[name] ?? match);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function wallTimeLabel(time: string): string {
  const [hours = "0", minutes = "00"] = time.split(":");
  const hour = String(Number(hours));

  return minutes === "00"
    ? fill(copy.hours, { hours: hour })
    : fill(copy.hoursMinutes, { hours: hour, minutes });
}

export function wallDateLabel(date: string, now: Date): string {
  const sameYear = date.slice(0, 4) === schoolToday(now).slice(0, 4);
  const format = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });

  return format.format(utcDay(date));
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

  return capitalize(wallDateLabel(date, now));
}

export function deadlineLabel(
  deadlineDate: string,
  deadlineTime: string | undefined,
  now: Date,
): string {
  const day = dayLabel(deadlineDate, now);
  if (!deadlineTime) return day;

  return fill(copy.dateWithTime, { date: day, time: wallTimeLabel(deadlineTime) });
}

export function instantLabel(instant: string, now: Date): string {
  const wall = utcToZonedWall(new Date(instant), SCHOOL_TIME_ZONE);
  if (wall.isFailure) return instant;

  return deadlineLabel(wall.getValue().date, wall.getValue().time, now);
}
