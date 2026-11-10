export const DAY_MS = 86_400_000;

export function shiftInstant(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}

export function shiftDate(isoDate: string, days: number): string {
  return shiftInstant(new Date(`${isoDate}T00:00:00Z`), days)
    .toISOString()
    .slice(0, 10);
}
