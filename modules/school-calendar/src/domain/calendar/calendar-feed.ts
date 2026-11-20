import type { DateRange } from "../value-objects/date-range.vo";
import type { BankHolidayTerritory, SchoolZoneValue } from "../value-objects/school-zone.vo";

export type CalendarFeed =
  | { provider: "education-nationale"; zone: SchoolZoneValue }
  | { provider: "api-gouv"; territory: BankHolidayTerritory }
  | { provider: "openholidays"; country: string }
  | { provider: "nager-date"; country: string };

export type HolidayNames = Record<string, string>;

export interface CalendarEntry {
  names: HolidayNames;
  startsOn: string;
  endsOn: string;
  regions: string[] | null;
}

function scopeOf(feed: CalendarFeed): string {
  switch (feed.provider) {
    case "education-nationale":
      return feed.zone;
    case "api-gouv":
      return feed.territory;
    default:
      return feed.country;
  }
}

export function feedKey(feed: CalendarFeed, period: string): string {
  return `${feed.provider}:${scopeOf(feed)}:${period}`;
}

export function feedPeriods(feed: CalendarFeed, range: DateRange): string[] {
  if (feed.provider === "education-nationale") return range.schoolYears();

  return range.calendarYears().map(String);
}

export function nameIn(names: HolidayNames, language: string): string {
  return names[language] ?? names.fr ?? names.en ?? Object.values(names)[0] ?? "";
}
