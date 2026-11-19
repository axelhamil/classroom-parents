import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

const regionNames = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });

const NOT_A_COUNTRY = new Set(["EU", "EZ", "UN", "ZZ"]);

function isCountryCode(value: string): boolean {
  return !NOT_A_COUNTRY.has(value) && regionNames.of(value) !== undefined;
}

export const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine(isCountryCode);

export class Country extends ValueObject<string> {
  protected validate(value: string): Result<string> {
    const parsed = countrySchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown country ${value}`);

    return Result.ok(parsed.data);
  }
}
