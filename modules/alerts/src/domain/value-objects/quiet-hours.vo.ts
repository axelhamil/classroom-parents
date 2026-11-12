import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";
import { AlertTime } from "./alert-time.vo";

const WALL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  shift(time: AlertTime, deadlineAt: Date, now: Date): Result<AlertTime> {
    const { date, time: wall } = time.value;
    if (!this.silences(wall)) return Result.ok(time);

    const { start, end } = this.value;
    const overnight = start > end;
    const after = AlertTime.before(date, overnight && wall > start ? -1 : 0, end);
    if (after.isFailure) return after;
    if (after.getValue().value.at.getTime() < deadlineAt.getTime()) return after;

    const before = AlertTime.before(date, overnight && wall < end ? 1 : 0, start);
    if (before.isFailure) return before;
    if (before.getValue().isAfter(now)) return before;

    return Result.ok(time);
  }

  protected validate(value: QuietHoursValue): Result<QuietHoursValue> {
    const parsed = quietHoursSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail("quiet hours are two different HH:MM times and an on or off switch");

    return Result.ok(parsed.data);
  }
}
