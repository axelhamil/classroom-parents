export const DAY_MS = 86_400_000;

const WEEK_LENGTH = 7;
const MONDAY = 1;
const FRIDAY = 5;

export function shiftInstant(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}

export function shiftDate(isoDate: string, days: number): string {
  return shiftInstant(new Date(`${isoDate}T00:00:00Z`), days)
    .toISOString()
    .slice(0, 10);
}

export function daysFrom(isoDate: string, length: number): string[] {
  return Array.from({ length }, (_, offset) => shiftDate(isoDate, offset));
}

export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

export function mondayOf(isoDate: string): string {
  return shiftDate(isoDate, -((weekdayOf(isoDate) + WEEK_LENGTH - MONDAY) % WEEK_LENGTH));
}

export function isWeekday(isoDate: string): boolean {
  const weekday = weekdayOf(isoDate);

  return weekday >= MONDAY && weekday <= FRIDAY;
}
