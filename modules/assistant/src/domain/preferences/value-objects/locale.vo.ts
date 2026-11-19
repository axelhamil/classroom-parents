import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const PARENT_LOCALES = ["fr", "en", "es", "pt", "ar"] as const;

export type LocaleValue = (typeof PARENT_LOCALES)[number];

export const localeSchema = z.enum(PARENT_LOCALES);

export class Locale extends ValueObject<LocaleValue> {
  protected validate(value: LocaleValue): Result<LocaleValue> {
    const parsed = localeSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unsupported locale ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
