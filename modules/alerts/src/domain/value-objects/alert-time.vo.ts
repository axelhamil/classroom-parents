import { Result, ValueObject } from "@packages/ddd-kit";
import { utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

export const ALERT_TIME_ZONE = "Europe/Paris";
export const DEFAULT_DAYS_BEFORE = 2;
export const DEFAULT_WALL_TIME = "18:00";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const alertTimeSchema = z.object({
  date: z.string().regex(DATE_PATTERN),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  at: z.date(),
});

export type AlertTimeValue = z.infer<typeof alertTimeSchema>;

function parisInstant(date: string, time: string): Result<Date> {
  return zonedWallTimeToUtc(date, time, ALERT_TIME_ZONE).mapError(
    (code) => `${date} ${time} is not a Paris wall time (${code})`,
  );
}

function daysBefore(date: string, days: number): Result<string> {
  const match = DATE_PATTERN.exec(date);
  if (!match) return Result.fail(`${date} is not a YYYY-MM-DD date`);

  const [year, month, day] = match.slice(1).map(Number);
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - days));

  return Result.ok(shifted.toISOString().slice(0, 10));
}

export function daysBetween(earlier: string, later: string): Result<number> {
  const from = DATE_PATTERN.test(earlier) ? Date.parse(`${earlier}T00:00:00.000Z`) : Number.NaN;
  const to = DATE_PATTERN.test(later) ? Date.parse(`${later}T00:00:00.000Z`) : Number.NaN;
  if (Number.isNaN(from) || Number.isNaN(to))
    return Result.fail(`${earlier} or ${later} is not a YYYY-MM-DD date`);

  return Result.ok(Math.round((to - from) / 86_400_000));
}

export class AlertTime extends ValueObject<AlertTimeValue> {
  static fromParisWallTime(date: string, time: string): Result<AlertTime> {
    const at = parisInstant(date, time);
    if (at.isFailure) return Result.fail(at.getError());

    return AlertTime.create({ date, time, at: at.getValue() });
  }

  static defaultBefore(deadlineDate: string): Result<AlertTime> {
    return AlertTime.before(deadlineDate, DEFAULT_DAYS_BEFORE, DEFAULT_WALL_TIME);
  }

  static before(deadlineDate: string, days: number, time: string): Result<AlertTime> {
    const date = daysBefore(deadlineDate, days);
    if (date.isFailure) return Result.fail(date.getError());

    return AlertTime.fromParisWallTime(date.getValue(), time);
  }

  static fromInstant(instant: Date): Result<AlertTime> {
    const wall = utcToZonedWall(instant, ALERT_TIME_ZONE);
    if (wall.isFailure) return Result.fail(`${String(instant)} has no Paris wall time`);

    return AlertTime.fromParisWallTime(wall.getValue().date, wall.getValue().time);
  }

  isAfter(instant: Date): boolean {
    return this.value.at.getTime() > instant.getTime();
  }

  protected validate(value: AlertTimeValue): Result<AlertTimeValue> {
    const parsed = alertTimeSchema.safeParse(value);
    if (!parsed.success) return Result.fail("an alert time is a YYYY-MM-DD date and an HH:MM time");

    const expected = parisInstant(parsed.data.date, parsed.data.time);
    if (expected.isFailure) return Result.fail(expected.getError());
    if (expected.getValue().getTime() !== parsed.data.at.getTime())
      return Result.fail("an alert instant must match its Paris wall time");

    return Result.ok(parsed.data);
  }
}
