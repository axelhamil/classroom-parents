import { Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";
import { SCHOOL_ZONES, SchoolZone, schoolZoneSchema } from "../value-objects/school-zone.vo";
import type { CalendarEntry, CalendarFeed } from "./calendar-feed";
import { type CountryCoverage, coverageOf, FRANCE } from "./coverage";

export const SCHOOL_HOLIDAY_MODES = ["official", "own", "unknown"] as const;

export type SchoolHolidayMode = (typeof SCHOOL_HOLIDAY_MODES)[number];

export type CalendarSource = "education-nationale" | "openholidays" | "own" | "none";

const REGION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,8}){1,3}$/;

const FRENCH_ZONES: ReadonlySet<string> = new Set(SCHOOL_ZONES);

export const schoolCalendarChoiceSchema = z
  .object({
    country: z.string().regex(/^[A-Z]{2}$/),
    region: z.string().max(32).nullable(),
    schoolHolidays: z.enum(SCHOOL_HOLIDAY_MODES),
  })
  .refine(({ country }) => coverageOf(country).isSome(), "this country has no calendar source")
  .refine(({ country, region }) => region === null || regionBelongsTo(country, region), {
    message: "this region does not belong to the country",
  })
  .refine(
    ({ country, schoolHolidays }) =>
      schoolHolidays !== "official" || hasOfficialSchoolHolidays(country),
    "no official school holidays are published for this country",
  );

export type SchoolCalendarChoiceValue = z.infer<typeof schoolCalendarChoiceSchema>;

function regionBelongsTo(country: string, region: string): boolean {
  if (country === FRANCE) return FRENCH_ZONES.has(region);

  return REGION_CODE.test(region) && region.startsWith(`${country}-`);
}

function hasOfficialSchoolHolidays(country: string): boolean {
  return coverageOf(country)
    .flatMap(({ schoolHolidays }) => Option.fromNullable(schoolHolidays))
    .isSome();
}

function frenchZoneOf(region: string | null): Option<SchoolZone> {
  const parsed = schoolZoneSchema.safeParse(region);
  if (!parsed.success) return Option.none();

  const zone = SchoolZone.create(parsed.data);

  return zone.isSuccess ? Option.some(zone.getValue()) : Option.none();
}

export class SchoolCalendarChoice extends ValueObject<SchoolCalendarChoiceValue> {
  source(): CalendarSource {
    if (this.value.schoolHolidays === "own") return "own";
    if (this.value.schoolHolidays === "unknown") return "none";

    return this.coverage().schoolHolidays ?? "none";
  }

  schoolHolidayFeed(): Option<CalendarFeed> {
    const source = this.source();
    if (source === "openholidays")
      return Option.some({ provider: source, country: this.value.country });
    if (source !== "education-nationale") return Option.none();

    return frenchZoneOf(this.value.region).map(({ value }) => ({ provider: source, zone: value }));
  }

  bankHolidayFeed(): Option<CalendarFeed> {
    const provider = this.coverage().bankHolidays;
    if (provider === "nager-date") return Option.some({ provider, country: this.value.country });
    if (provider !== "api-gouv") return Option.none();

    const territory = frenchZoneOf(this.value.region)
      .map((zone) => zone.bankHolidayTerritory())
      .unwrapOr("metropole");

    return Option.some({ provider, territory });
  }

  appliesTo(entry: CalendarEntry): boolean {
    const region = this.value.region;
    if (entry.regions === null) return true;
    if (region === null) return false;

    return entry.regions.some((code) => code === region || code.startsWith(`${region}-`));
  }

  protected validate(value: SchoolCalendarChoiceValue): Result<SchoolCalendarChoiceValue> {
    const parsed = schoolCalendarChoiceSchema.safeParse(value);
    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "invalid choice");

    return Result.ok(parsed.data);
  }

  private coverage(): CountryCoverage {
    return coverageOf(this.value.country).unwrapOr({
      code: this.value.country,
      schoolHolidays: null,
      bankHolidays: null,
    });
  }
}
