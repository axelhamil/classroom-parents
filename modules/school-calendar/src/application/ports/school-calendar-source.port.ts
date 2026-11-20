import type { Result } from "@packages/ddd-kit";
import type {
  CalendarEntry,
  CalendarFeed,
  HolidayNames,
} from "../../domain/calendar/calendar-feed";
import type { SchoolCalendarError } from "../errors/school-calendar-errors";

export interface Region {
  code: string;
  names: HolidayNames;
}

export interface ISchoolCalendarSource {
  entries(
    feed: CalendarFeed,
    period: string,
  ): Promise<Result<CalendarEntry[], SchoolCalendarError>>;

  regions(country: string): Promise<Result<Region[], SchoolCalendarError>>;
}
