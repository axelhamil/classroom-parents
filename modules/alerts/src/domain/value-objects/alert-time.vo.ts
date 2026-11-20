import { Result, ValueObject } from "@packages/ddd-kit";
import {
  utcToZonedWall,
  type ZonedWall,
  zonedWallTimeToUtc,
  zonedWallTimeToUtcShifted,
} from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTE_MS = 60_000;

export const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const alertTimeSchema = z.object({
  at: z.date().refine((at) => Number.isInteger(at.getTime() / MINUTE_MS)),
});

export type AlertTimeValue = z.infer<typeof alertTimeSchema>;

function daysBefore(date: string, days: number): Result<string> {
  const match = DATE_PATTERN.exec(date);
  if (!match) return Result.fail(`${date} is not a YYYY-MM-DD date`);

  const [year, month, day] = match.slice(1).map(Number);
  const shifted = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) - days));

  return Result.ok(shifted.toISOString().slice(0, 10));
}

export class AlertTime extends ValueObject<AlertTimeValue> {
  static fromInstant(instant: Date): Result<AlertTime> {
    const minute = Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS;

    return AlertTime.create({ at: new Date(minute) });
  }

  static fromWallTime(date: string, time: string, timeZone: string): Result<AlertTime> {
    const at = zonedWallTimeToUtc(date, time, timeZone);
    if (at.isFailure)
      return Result.fail(`${date} ${time} is not a wall time of ${timeZone} (${at.getError()})`);

    return AlertTime.create({ at: at.getValue() });
  }

  static before(
    deadlineDate: string,
    days: number,
    time: string,
    timeZone: string,
  ): Result<AlertTime> {
    const date = daysBefore(deadlineDate, days);
    if (date.isFailure) return Result.fail(date.getError());

    const shifted = zonedWallTimeToUtcShifted(date.getValue(), time, timeZone);
    if (shifted.isFailure)
      return Result.fail(
        `${date.getValue()} ${time} is not a wall time of ${timeZone} (${shifted.getError()})`,
      );

    return AlertTime.create({ at: shifted.getValue().at });
  }

  wallIn(timeZone: string): Result<ZonedWall> {
    return utcToZonedWall(this.value.at, timeZone).mapError(
      (code) => `${this.value.at.toISOString()} has no wall time in ${timeZone} (${code})`,
    );
  }

  isAfter(instant: Date): boolean {
    return this.value.at.getTime() > instant.getTime();
  }

  protected validate(value: AlertTimeValue): Result<AlertTimeValue> {
    const parsed = alertTimeSchema.safeParse(value);
    if (!parsed.success) return Result.fail("an alert rings at a valid instant, on a whole minute");

    return Result.ok(parsed.data);
  }
}
