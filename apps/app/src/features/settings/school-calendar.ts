import type { SchoolCalendarChoice } from "./api/school-calendar.mutations";
import type { SchoolCalendarSettings, SchoolHolidayMode } from "./api/school-calendar.queries";

export const FRANCE = "FR";

export const UNKNOWN_REGION = "unknown";

export const HOLIDAY_MODES = [
  "official",
  "own",
  "unknown",
] as const satisfies readonly SchoolHolidayMode[];

export type CalendarCountry = SchoolCalendarSettings["countries"][number];

export type SavedChoice = NonNullable<SchoolCalendarSettings["choice"]>;

export function defaultModeOf(country: CalendarCountry): SchoolHolidayMode {
  return country.officialSchoolHolidays ? "official" : "own";
}

/** The calendar of a country the parent has just chosen: the whole country, its default holidays. */
export function choiceFor(country: CalendarCountry): SchoolCalendarChoice {
  return { country: country.code, region: null, schoolHolidays: defaultModeOf(country) };
}

export function coverageOf(
  settings: SchoolCalendarSettings,
  country: string,
): CalendarCountry | undefined {
  return settings.countries.find(({ code }) => code === country);
}
