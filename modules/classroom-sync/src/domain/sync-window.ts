const DAY_MS = 24 * 60 * 60_000;

export const LOOKBACK_DAYS = 60;
export const SYNC_INTERVAL_MS = 30 * 60_000;
export const FAILURE_RETRY_MS = 10 * 60_000;

export function windowStart(now: Date): Date {
  return new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
}

export function isWithinWindow(publishedAt: Date, now: Date): boolean {
  return publishedAt.getTime() >= windowStart(now).getTime();
}

export function nextSyncAt(now: Date, jitterMs: number): Date {
  return new Date(now.getTime() + SYNC_INTERVAL_MS + jitterMs);
}

export function retryAt(now: Date): Date {
  return new Date(now.getTime() + FAILURE_RETRY_MS);
}

export function isDayWithinWindow(day: string, now: Date): boolean {
  return day >= windowStart(now).toISOString().slice(0, 10);
}
