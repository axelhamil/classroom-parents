import { Result, ValueObject } from "@packages/ddd-kit";
import { DAY_MS } from "@packages/ddd-kit/days";
import { z } from "zod";

export const OWN_PERIOD_NAME_MAX = 120;
const LONGEST_PERIOD_DAYS = 120;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]+/gu;

export type OwnPeriodOrigin = "ics" | "manual";

function spanDays(startsOn: string, endsOn: string): number {
  return (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / DAY_MS;
}

/** Names come from a parent or a file published by a school: control and format characters go, spaces collapse. */
export function cleanPeriodName(raw: string): string {
  return raw
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OWN_PERIOD_NAME_MAX);
}

export const ownPeriodSchema = z
  .object({
    name: z.string().transform(cleanPeriodName).pipe(z.string().min(1)),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine(({ startsOn, endsOn }) => startsOn <= endsOn, "the period ends before it starts")
  .refine(
    ({ startsOn, endsOn }) => spanDays(startsOn, endsOn) < LONGEST_PERIOD_DAYS,
    `a holiday period lasts less than ${LONGEST_PERIOD_DAYS} days`,
  );

export type OwnPeriodValue = z.output<typeof ownPeriodSchema>;

export class OwnPeriod extends ValueObject<OwnPeriodValue> {
  protected validate(value: OwnPeriodValue): Result<OwnPeriodValue> {
    const parsed = ownPeriodSchema.safeParse(value);
    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "invalid period");

    return Result.ok(parsed.data);
  }
}
