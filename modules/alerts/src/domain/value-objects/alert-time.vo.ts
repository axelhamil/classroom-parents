import { Result, ValueObject } from "@packages/ddd-kit";
import {
  matchesZonedWall,
  PARIS_TIME_ZONE,
  utcToZonedWall,
  zonedWallTimeToUtc,
  zonedWallTimeToUtcShifted,
} from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const alertTimeSchema = z.object({
  date: z.string().regex(DATE_PATTERN),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  at: z.date(),
});

export type AlertTimeValue = z.infer<typeof alertTimeSchema>;

function parisInstant(date: string, time: string): Result<Date> {
  return zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE).mapError(
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

export class AlertTime extends ValueObject<AlertTimeValue> {
  static fromParisWallTime(date: string, time: string): Result<AlertTime> {
    const at = parisInstant(date, time);
    if (at.isFailure) return Result.fail(at.getError());

    return AlertTime.create({ date, time, at: at.getValue() });
  }

  static before(deadlineDate: string, days: number, time: string): Result<AlertTime> {
    const date = daysBefore(deadlineDate, days);
    if (date.isFailure) return Result.fail(date.getError());

    const shifted = zonedWallTimeToUtcShifted(date.getValue(), time, PARIS_TIME_ZONE);
    if (shifted.isFailure)
      return Result.fail(
        `${date.getValue()} ${time} is not a Paris wall time (${shifted.getError()})`,
      );

    const { at, wall } = shifted.getValue();
    return AlertTime.create({ date: wall.date, time: wall.time, at });
  }

  static fromInstant(instant: Date): Result<AlertTime> {
    const wall = utcToZonedWall(instant, PARIS_TIME_ZONE);
    if (wall.isFailure) return Result.fail(`${String(instant)} has no Paris wall time`);

    return AlertTime.fromParisWallTime(wall.getValue().date, wall.getValue().time);
  }

  isAfter(instant: Date): boolean {
    return this.value.at.getTime() > instant.getTime();
  }

  protected validate(value: AlertTimeValue): Result<AlertTimeValue> {
    const parsed = alertTimeSchema.safeParse(value);
    if (!parsed.success) return Result.fail("an alert time is a YYYY-MM-DD date and an HH:MM time");

    const { date, time, at } = parsed.data;
    const matches = matchesZonedWall(date, time, at, PARIS_TIME_ZONE);
    if (matches.isFailure)
      return Result.fail(`an alert instant must match its Paris wall time (${matches.getError()})`);

    return Result.ok(parsed.data);
  }
}
