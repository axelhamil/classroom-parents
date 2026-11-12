import { Result, ValueObject } from "@packages/ddd-kit";
import { DAY_MS, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import { z } from "zod";

export const CALENDAR_RANGE_MAX_DAYS = 62;

const calendarRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  startsAt: z.date(),
  endsBefore: z.date(),
});

export type CalendarRangeValue = z.infer<typeof calendarRangeSchema>;

const outOfFormat = "a calendar range runs between two YYYY-MM-DD dates";
const offMidnight = "a calendar range starts and ends at a Paris midnight";

function daysBetween(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
}

function parisMidnight(date: string): Result<Date> {
  return zonedWallTimeToUtc(date, "00:00", PARIS_TIME_ZONE);
}

function sameInstant(expected: Result<Date>, actual: Date): boolean {
  return expected.isSuccess && expected.getValue().getTime() === actual.getTime();
}

export class CalendarRange extends ValueObject<CalendarRangeValue> {
  static between(from: string, to: string): Result<CalendarRange> {
    const dates = calendarRangeSchema.pick({ from: true, to: true }).safeParse({ from, to });
    if (!dates.success) return Result.fail(outOfFormat);

    const startsAt = parisMidnight(from);
    const endsBefore = parisMidnight(shiftDate(to, 1));
    if (startsAt.isFailure || endsBefore.isFailure) return Result.fail(offMidnight);

    return CalendarRange.create({
      from,
      to,
      startsAt: startsAt.getValue(),
      endsBefore: endsBefore.getValue(),
    });
  }

  protected validate(value: CalendarRangeValue): Result<CalendarRangeValue> {
    const parsed = calendarRangeSchema.safeParse(value);
    if (!parsed.success) return Result.fail(outOfFormat);

    const { from, to, startsAt, endsBefore } = parsed.data;
    const days = daysBetween(from, to);
    if (days < 1 || days > CALENDAR_RANGE_MAX_DAYS)
      return Result.fail(`a calendar range covers 1 to ${CALENDAR_RANGE_MAX_DAYS} days`);

    const onMidnights =
      sameInstant(parisMidnight(from), startsAt) &&
      sameInstant(parisMidnight(shiftDate(to, 1)), endsBefore);
    if (!onMidnights) return Result.fail(offMidnight);

    return Result.ok(parsed.data);
  }
}
