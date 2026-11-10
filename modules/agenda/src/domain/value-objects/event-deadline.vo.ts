import { Result, ValueObject } from "@packages/ddd-kit";
import {
  matchesZonedWall,
  PARIS_TIME_ZONE,
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
});

const eventDeadlineSchema = wallTimeSchema.extend({ at: z.date() });

export type EventDeadlineValue = z.infer<typeof eventDeadlineSchema>;

function parisInstant(date: string, time: string | undefined): Result<Date> {
  return zonedWallTimeToUtc(date, time ?? END_OF_DAY, PARIS_TIME_ZONE).mapError(
    (code) => `${date} ${time ?? END_OF_DAY} is not a Paris wall time (${code})`,
  );
}

export class EventDeadline extends ValueObject<EventDeadlineValue> {
  static fromParisWallTime(date: string, time?: string): Result<EventDeadline> {
    const at = parisInstant(date, time);
    if (at.isFailure) return Result.fail(at.getError());

    return EventDeadline.create({ date, time, at: at.getValue() });
  }

  static fromComputedParisWallTime(date: string, time?: string): Result<EventDeadline> {
    if (time === undefined) return EventDeadline.fromParisWallTime(date);

    const shifted = zonedWallTimeToUtcShifted(date, time, PARIS_TIME_ZONE);
    if (shifted.isFailure)
      return Result.fail(`${date} ${time} is not a Paris wall time (${shifted.getError()})`);

    const { at, wall } = shifted.getValue();
    return EventDeadline.create({ date: wall.date, time: wall.time, at });
  }

  protected validate(value: EventDeadlineValue): Result<EventDeadlineValue> {
    const parsed = eventDeadlineSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail("a deadline is a YYYY-MM-DD date and an optional HH:MM");

    const { date, time, at } = parsed.data;
    const matches = matchesZonedWall(date, time ?? END_OF_DAY, at, PARIS_TIME_ZONE);
    if (matches.isFailure)
      return Result.fail(
        `a deadline instant must match its Paris wall time (${matches.getError()})`,
      );

    return Result.ok(parsed.data);
  }
}
