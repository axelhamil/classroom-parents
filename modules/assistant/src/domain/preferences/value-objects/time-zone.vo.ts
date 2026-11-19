import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timeZoneSchema = z.string().min(1).max(64).refine(isKnownTimeZone);

export class TimeZone extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = timeZoneSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown time zone ${value}`);

    return Result.ok(parsed.data);
  }
}
