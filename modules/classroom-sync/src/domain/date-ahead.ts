import { DAY_MS } from "@packages/ddd-kit/days";
import { utcToZonedWall } from "@packages/ddd-kit/zoned-time";

const RELATIVE_REACH_DAYS = 14;

export interface WrittenDate {
  day: number;
  month: number;
  year?: number;
}

function dayIn(instant: Date, timeZone: string): string {
  return utcToZonedWall(instant, timeZone)
    .map(({ date }) => date)
    .unwrapOr(instant.toISOString().slice(0, 10));
}

function isoDay(year: number, { day, month }: WrittenDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolvedDay(written: WrittenDate, publishedDay: string): string {
  if (written.year !== undefined) return isoDay(written.year, written);

  const publishedYear = Number(publishedDay.slice(0, 4));
  const sameYear = isoDay(publishedYear, written);
  return sameYear >= publishedDay ? sameYear : isoDay(publishedYear + 1, written);
}

export function mayHoldDateAhead(
  written: WrittenDate[],
  publishedAt: Date,
  now: Date,
  timeZone: string,
): boolean {
  const today = dayIn(now, timeZone);
  const publishedDay = dayIn(publishedAt, timeZone);
  if (written.length > 0) return written.some((date) => resolvedDay(date, publishedDay) >= today);

  const relativeReach = new Date(publishedAt.getTime() + RELATIVE_REACH_DAYS * DAY_MS);
  return dayIn(relativeReach, timeZone) >= today;
}
