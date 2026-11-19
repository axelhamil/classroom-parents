import { Result, ValueObject } from "@packages/ddd-kit";
import { DAY_MS, shiftDate } from "@packages/ddd-kit/days";
import { z } from "zod";

const MAX_SPAN_DAYS = 400;
const SCHOOL_YEAR_FIRST_MONTH = 9;
const SUMMER_TAIL_DAYS = 31;

const isoDateSchema = z.iso.date();

const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine(({ from, to }) => from <= to, "the range ends before it starts")
  .refine(
    ({ from, to }) => daysBetween(from, to) <= MAX_SPAN_DAYS,
    `the range spans more than ${MAX_SPAN_DAYS} days`,
  );

export type DateRangeValue = z.infer<typeof dateRangeSchema>;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

function yearOf(isoDate: string): number {
  return Number(isoDate.slice(0, 4));
}

function schoolYearStartOf(isoDate: string): number {
  const month = Number(isoDate.slice(5, 7));

  return month >= SCHOOL_YEAR_FIRST_MONTH ? yearOf(isoDate) : yearOf(isoDate) - 1;
}

function yearsBetween(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, offset) => first + offset);
}

export class DateRange extends ValueObject<DateRangeValue> {
  schoolYears(): string[] {
    const first = schoolYearStartOf(shiftDate(this.value.from, -SUMMER_TAIL_DAYS));
    const last = schoolYearStartOf(this.value.to);

    return yearsBetween(first, last).map((start) => `${start}-${start + 1}`);
  }

  calendarYears(): number[] {
    return yearsBetween(yearOf(this.value.from), yearOf(this.value.to));
  }

  overlaps(startsOn: string, endsOn: string): boolean {
    return startsOn <= this.value.to && endsOn >= this.value.from;
  }

  contains(isoDate: string): boolean {
    return this.overlaps(isoDate, isoDate);
  }

  protected validate(value: DateRangeValue): Result<DateRangeValue> {
    const parsed = dateRangeSchema.safeParse(value);
    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "invalid range");

    return Result.ok(parsed.data);
  }
}
