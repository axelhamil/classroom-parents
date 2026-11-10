import { Result, ValueObject } from "@packages/ddd-kit";
import { zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

export const AGENDA_TIME_ZONE = "Europe/Paris";
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
  return zonedWallTimeToUtc(date, time ?? END_OF_DAY, AGENDA_TIME_ZONE).mapError(
    (code) => `${date} ${time ?? END_OF_DAY} is not a Paris wall time (${code})`,
  );
}

export class EventDeadline extends ValueObject<EventDeadlineValue> {
  static fromParisWallTime(date: string, time?: string): Result<EventDeadline> {
    const at = parisInstant(date, time);
    if (at.isFailure) return Result.fail(at.getError());

    return EventDeadline.create({ date, time, at: at.getValue() });
  }

  protected validate(value: EventDeadlineValue): Result<EventDeadlineValue> {
    const parsed = eventDeadlineSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail("a deadline is a YYYY-MM-DD date and an optional HH:MM");

    const expected = parisInstant(parsed.data.date, parsed.data.time);
    if (expected.isFailure) return Result.fail(expected.getError());
    if (expected.getValue().getTime() !== parsed.data.at.getTime())
      return Result.fail("a deadline instant must match its Paris wall time");

    return Result.ok(parsed.data);
  }
}
