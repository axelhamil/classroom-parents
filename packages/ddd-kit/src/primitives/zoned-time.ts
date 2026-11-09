import { Result } from "./result";

interface ZonedWall {
  date: string;
  time: string;
}

type ZonedTimeError =
  | "ZONED_TIME_INVALID_WALL_TIME"
  | "ZONED_TIME_INVALID_TIME_ZONE"
  | "ZONED_TIME_INVALID_INSTANT";

const TRANSITION_WINDOW_MS = 24 * 3_600_000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterOrNone(timeZone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return undefined;
  }
}

function formatterFor(timeZone: string): Result<Intl.DateTimeFormat, ZonedTimeError> {
  const cached = formatters.get(timeZone);
  if (cached) return Result.ok(cached);

  const formatter = formatterOrNone(timeZone);
  if (!formatter) return Result.fail("ZONED_TIME_INVALID_TIME_ZONE");

  formatters.set(timeZone, formatter);

  return Result.ok(formatter);
}

function wallParts(formatter: Intl.DateTimeFormat, instant: number): Record<string, string> {
  return Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
}

function wallAsUtcMs(formatter: Intl.DateTimeFormat, instant: number): number {
  const parts = wallParts(formatter, instant);

  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function offsetAt(formatter: Intl.DateTimeFormat, instant: number): number {
  const wholeSeconds = instant - (instant % 1000);

  return wallAsUtcMs(formatter, wholeSeconds) - wholeSeconds;
}

function requestedWallAsUtcMs(date: string, time: string): Result<number, ZonedTimeError> {
  const dateMatch = DATE_PATTERN.exec(date);
  const timeMatch = TIME_PATTERN.exec(time);
  if (!dateMatch || !timeMatch) return Result.fail("ZONED_TIME_INVALID_WALL_TIME");

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hour, minute] = timeMatch.slice(1).map(Number);
  const wall = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  );

  const asRequested =
    wall.getUTCFullYear() === year &&
    wall.getUTCMonth() + 1 === month &&
    wall.getUTCDate() === day &&
    wall.getUTCHours() === hour &&
    wall.getUTCMinutes() === minute;
  if (!asRequested) return Result.fail("ZONED_TIME_INVALID_WALL_TIME");

  return Result.ok(wall.getTime());
}

export function zonedWallTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): Result<Date, ZonedTimeError> {
  const requested = requestedWallAsUtcMs(date, time);
  if (requested.isFailure) return Result.fail(requested.getError());

  const zone = formatterFor(timeZone);
  if (zone.isFailure) return Result.fail(zone.getError());

  const wall = requested.getValue();
  const formatter = zone.getValue();
  const offsetBefore = offsetAt(formatter, wall - TRANSITION_WINDOW_MS);
  const offsetAfter = offsetAt(formatter, wall + TRANSITION_WINDOW_MS);

  const existing = [wall - offsetBefore, wall - offsetAfter].find(
    (instant) => wallAsUtcMs(formatter, instant) === wall,
  );

  return Result.ok(new Date(existing ?? wall - offsetBefore));
}

export function utcToZonedWall(instant: Date, timeZone: string): Result<ZonedWall, ZonedTimeError> {
  if (Number.isNaN(instant.getTime())) return Result.fail("ZONED_TIME_INVALID_INSTANT");

  const zone = formatterFor(timeZone);
  if (zone.isFailure) return Result.fail(zone.getError());

  const parts = wallParts(zone.getValue(), instant.getTime());

  return Result.ok({
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  });
}
