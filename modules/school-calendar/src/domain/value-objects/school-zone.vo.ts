import { Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";

export const SCHOOL_ZONES = [
  "zone-a",
  "zone-b",
  "zone-c",
  "corse",
  "guadeloupe",
  "guyane",
  "martinique",
  "mayotte",
  "reunion",
] as const;

export type SchoolZoneValue = (typeof SCHOOL_ZONES)[number];

export const schoolZoneSchema = z.enum(SCHOOL_ZONES);

export type BankHolidayTerritory =
  | "metropole"
  | "guadeloupe"
  | "guyane"
  | "martinique"
  | "mayotte"
  | "la-reunion";

const TERRITORY_BY_ZONE: Record<SchoolZoneValue, BankHolidayTerritory> = {
  "zone-a": "metropole",
  "zone-b": "metropole",
  "zone-c": "metropole",
  corse: "metropole",
  guadeloupe: "guadeloupe",
  guyane: "guyane",
  martinique: "martinique",
  mayotte: "mayotte",
  reunion: "la-reunion",
};

export class SchoolZone extends ValueObject<SchoolZoneValue> {
  bankHolidayTerritory(): BankHolidayTerritory {
    return TERRITORY_BY_ZONE[this.value];
  }

  protected validate(value: SchoolZoneValue): Result<SchoolZoneValue> {
    const parsed = schoolZoneSchema.safeParse(value);
    if (!parsed.success) return Result.fail(`unknown school zone ${String(value)}`);

    return Result.ok(parsed.data);
  }
}
