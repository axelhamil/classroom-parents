interface ZonedWall {
  date: string;
  time: string;
}

const HOUR_MS = 3_600_000;
const TRANSITION_WINDOW_MS = 12 * HOUR_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatters.set(timeZone, formatter);

  return formatter;
}

function wallParts(instant: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
}

function wallAsUtcMs(instant: number, timeZone: string): number {
  const parts = wallParts(instant, timeZone);

  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function offsetAt(instant: number, timeZone: string): number {
  const wholeSeconds = instant - (instant % 1000);

  return wallAsUtcMs(wholeSeconds, timeZone) - wholeSeconds;
}

function requestedWallAsUtcMs(date: string, time: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const wall = requestedWallAsUtcMs(date, time);
  if (Number.isNaN(wall)) return new Date(Number.NaN);

  const offsetBefore = offsetAt(wall - TRANSITION_WINDOW_MS, timeZone);
  const offsetAfter = offsetAt(wall + TRANSITION_WINDOW_MS, timeZone);

  const existing = [wall - offsetBefore, wall - offsetAfter].find(
    (instant) => wallAsUtcMs(instant, timeZone) === wall,
  );

  return new Date(existing ?? wall - offsetBefore);
}

export function utcToZonedWall(instant: Date, timeZone: string): ZonedWall {
  const parts = wallParts(instant.getTime(), timeZone);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
