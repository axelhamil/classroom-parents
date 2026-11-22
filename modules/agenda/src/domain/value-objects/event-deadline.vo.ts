import { Result, ValueObject } from "@packages/ddd-kit";
import {
  matchesZonedWall,
  zonedWallTimeToUtc,
  zonedWallTimeToUtcShifted,
} from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

export const END_OF_DAY = "23:59";

const wallTimeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  schoolTimeZone: z.string().min(1),
});

const eventDeadlineSchema = wallTimeSchema.extend({ at: z.date() });

export type EventDeadlineValue = z.infer<typeof eventDeadlineSchema>;

function instantIn(date: string, time: string | undefined, timeZone: string): Result<Date> {
  return zonedWallTimeToUtc(date, time ?? END_OF_DAY, timeZone).mapError(
    (code) => `${date} ${time ?? END_OF_DAY} is not a wall time of ${timeZone} (${code})`,
  );
}

export class EventDeadline extends ValueObject<EventDeadlineValue> {
  static fromWallTime(
    date: string,
    time: string | undefined,
    timeZone: string,
  ): Result<EventDeadline> {
    const at = instantIn(date, time, timeZone);
    if (at.isFailure) return Result.fail(at.getError());

    return EventDeadline.create({ date, time, schoolTimeZone: timeZone, at: at.getValue() });
  }

  static fromComputedWallTime(
    date: string,
    time: string | undefined,
    timeZone: string,
  ): Result<EventDeadline> {
    if (time === undefined) return EventDeadline.fromWallTime(date, undefined, timeZone);

    const shifted = zonedWallTimeToUtcShifted(date, time, timeZone);
    if (shifted.isFailure)
      return Result.fail(
        `${date} ${time} is not a wall time of ${timeZone} (${shifted.getError()})`,
      );

    const { at, wall } = shifted.getValue();
    return EventDeadline.create({ date: wall.date, time: wall.time, schoolTimeZone: timeZone, at });
  }

  fallsWith(other: EventDeadline): boolean {
    const mine = this.value;
    const theirs = other.value;
    if (mine.time === undefined && theirs.time === undefined) return mine.date === theirs.date;

    return (
      mine.time !== undefined &&
      theirs.time !== undefined &&
      mine.at.getTime() === theirs.at.getTime()
    );
  }

  protected validate(value: EventDeadlineValue): Result<EventDeadlineValue> {
    const parsed = eventDeadlineSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail("a deadline is a YYYY-MM-DD date, an optional HH:MM and a time zone");

    const { date, time, at, schoolTimeZone } = parsed.data;
    const matches = matchesZonedWall(date, time ?? END_OF_DAY, at, schoolTimeZone);
    if (matches.isFailure)
      return Result.fail(
        `a deadline instant must match its wall time in ${schoolTimeZone} (${matches.getError()})`,
      );

    return Result.ok(parsed.data);
  }
}
