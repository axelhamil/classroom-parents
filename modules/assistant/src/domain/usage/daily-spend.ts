export interface DailySpend {
  todayMicroUsd: number;
  previousSevenDaysMicroUsd: number;
}

const ANOMALY_MULTIPLIER = 2;

export const ANOMALY_FLOOR_MICRO_USD = 1_000_000;

export function spendIsAbnormal(spend: DailySpend, dailyCapMicroUsd: number): boolean {
  if (spend.todayMicroUsd > dailyCapMicroUsd) return true;

  const average = spend.previousSevenDaysMicroUsd / 7;
  if (average === 0) return false;

  return spend.todayMicroUsd > Math.max(ANOMALY_MULTIPLIER * average, ANOMALY_FLOOR_MICRO_USD);
}
