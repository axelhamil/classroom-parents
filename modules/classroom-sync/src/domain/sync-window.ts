import { Option } from "@packages/ddd-kit";
import { DAY_MS, isWeekday, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";

const MINUTE_MS = 60_000;

export const LOOKBACK_DAYS = 60;
const SCHOOL_DAY_INTERVAL_MS = 60 * MINUTE_MS;
const OFF_HOURS_INTERVAL_MS = 6 * 60 * MINUTE_MS;
export const ALERT_LEAD_MS = 30 * MINUTE_MS;
export const FAILURE_RETRY_MS = 10 * MINUTE_MS;
export const SYNC_JITTER_MAX_MS = 3 * MINUTE_MS;
export const SERVED_MARGIN_MS = SYNC_JITTER_MAX_MS;

const SCHOOL_DAY_OPENS = "07:00";
const SCHOOL_DAY_CLOSES = "21:00";
const WEEK_DAYS = 7;

export interface SyncPlan {
  jitterMs: number;
  nextAlertAt: Option<Date>;
}

export function windowStart(now: Date): Date {
  return new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
}

export function isWithinWindow(publishedAt: Date, now: Date): boolean {
  return publishedAt.getTime() >= windowStart(now).getTime();
}

export function nextSyncAt(now: Date, plan: SyncPlan): Date {
  const slot = cadenceSlot(now, plan.jitterMs);
  const lead = plan.nextAlertAt
    .map((alertAt) => new Date(alertAt.getTime() - ALERT_LEAD_MS))
    .filter((leadAt) => !isServedBy(now, leadAt));

  return lead
    .map((leadAt) => earliest(slot, spreadBefore(leadAt, plan.jitterMs, now)))
    .unwrapOr(slot);
}

export function alertLookupFrom(now: Date): Date {
  return new Date(now.getTime() + ALERT_LEAD_MS + SERVED_MARGIN_MS);
}

export function retryAt(now: Date): Date {
  return new Date(now.getTime() + FAILURE_RETRY_MS);
}

export function firstSyncedDay(now: Date): string {
  return windowStart(now).toISOString().slice(0, 10);
}

export function isDayWithinWindow(day: string, now: Date): boolean {
  return day >= firstSyncedDay(now);
}

function cadenceSlot(now: Date, jitterMs: number): Date {
  const offHours = new Date(now.getTime() + OFF_HOURS_INTERVAL_MS + jitterMs);
  const wall = utcToZonedWall(now, PARIS_TIME_ZONE);
  if (wall.isFailure) return offHours;

  const { date, time } = wall.getValue();
  if (isWeekday(date) && time >= SCHOOL_DAY_OPENS && time < SCHOOL_DAY_CLOSES)
    return new Date(now.getTime() + SCHOOL_DAY_INTERVAL_MS + jitterMs);

  return nextOpening(date, time)
    .map((opening) =>
      isServedBy(now, opening)
        ? new Date(opening.getTime() + SCHOOL_DAY_INTERVAL_MS + jitterMs)
        : earliest(offHours, spreadBefore(opening, jitterMs, now)),
    )
    .unwrapOr(offHours);
}

function isServedBy(now: Date, deadline: Date): boolean {
  return deadline.getTime() - now.getTime() <= SERVED_MARGIN_MS;
}

function spreadBefore(deadline: Date, jitterMs: number, now: Date): Date {
  const spread = new Date(deadline.getTime() - jitterMs);
  return spread > now ? spread : deadline;
}

function nextOpening(date: string, time: string): Option<Date> {
  const first = isWeekday(date) && time < SCHOOL_DAY_OPENS ? 0 : 1;
  for (let offset = first; offset < first + WEEK_DAYS; offset++) {
    const day = shiftDate(date, offset);
    if (!isWeekday(day)) continue;

    const opening = zonedWallTimeToUtc(day, SCHOOL_DAY_OPENS, PARIS_TIME_ZONE);
    return opening.isSuccess ? Option.some(opening.getValue()) : Option.none();
  }

  return Option.none();
}

function earliest(left: Date, right: Date): Date {
  return left <= right ? left : right;
}
