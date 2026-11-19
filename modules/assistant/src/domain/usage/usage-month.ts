export interface UsageMonth {
  month: string;
  resumesOn: string;
}

const isoDay = (year: number, monthIndex: number): string =>
  new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);

export function usageMonthOf(now: Date): UsageMonth {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  return {
    month: isoDay(year, monthIndex),
    resumesOn: isoDay(year, monthIndex + 1),
  };
}
