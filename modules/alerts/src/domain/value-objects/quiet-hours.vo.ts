import { Result, ValueObject } from "@packages/ddd-kit";
import type { ZonedWall } from "@packages/ddd-kit/zoned-time";
import { z } from "zod";
import { AlertTime, WALL_TIME } from "./alert-time.vo";

export const quietHoursSchema = z
  .strictObject({
    enabled: z.boolean(),
    start: z.string().regex(WALL_TIME),
    end: z.string().regex(WALL_TIME),
  })
  .refine(({ start, end }) => start !== end);

export type QuietHoursValue = z.infer<typeof quietHoursSchema>;

export const DEFAULT_QUIET_HOURS: QuietHoursValue = { enabled: true, start: "21:00", end: "07:00" };

export class QuietHours extends ValueObject<QuietHoursValue> {
  static from(value: QuietHoursValue): Result<QuietHours> {
    return QuietHours.create<QuietHours, QuietHoursValue>(value);
  }

  static defaults(): QuietHours {
    return new QuietHours(DEFAULT_QUIET_HOURS);
  }

  silences(wallTime: string): boolean {
    const { enabled, start, end } = this.value;
    if (!enabled) return false;
    if (start > end) return wallTime > start || wallTime < end;

    return wallTime > start && wallTime < end;
  }

  silencesAt(time: AlertTime, timeZone: string): Result<boolean> {
    return time.wallIn(timeZone).map((wall) => this.silences(wall.time));
  }

  ringAfter(time: AlertTime, timeZone: string): Result<AlertTime> {
    const wall = time.wallIn(timeZone);
    if (wall.isFailure) return Result.fail(wall.getError());
    if (!this.silences(wall.getValue().time)) return Result.ok(time);

    return this.endAfter(wall.getValue(), timeZone);
  }

  shift(time: AlertTime, deadlineAt: Date, now: Date, timeZone: string): Result<AlertTime> {
    const wall = time.wallIn(timeZone);
    if (wall.isFailure) return Result.fail(wall.getError());
    if (!this.silences(wall.getValue().time)) return Result.ok(time);

    const after = this.endAfter(wall.getValue(), timeZone);
    if (after.isFailure) return after;
    if (after.getValue().value.at.getTime() < deadlineAt.getTime()) return after;

    const before = this.startBefore(wall.getValue(), timeZone);
    if (before.isFailure) return before;
    if (before.getValue().isAfter(now)) return before;

    return Result.ok(time);
  }

  private endAfter({ date, time }: ZonedWall, timeZone: string): Result<AlertTime> {
    const { start, end } = this.value;
    const overnight = start > end;

    return AlertTime.before(date, overnight && time > start ? -1 : 0, end, timeZone);
  }

  private startBefore({ date, time }: ZonedWall, timeZone: string): Result<AlertTime> {
    const { start, end } = this.value;
    const overnight = start > end;

    return AlertTime.before(date, overnight && time < end ? 1 : 0, start, timeZone);
  }

  protected validate(value: QuietHoursValue): Result<QuietHoursValue> {
    const parsed = quietHoursSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail("quiet hours are two different HH:MM times and an on or off switch");

    return Result.ok(parsed.data);
  }
}
