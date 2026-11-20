import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type {
  ISchoolCalendarSource,
  Region,
} from "../../application/ports/school-calendar-source.port";
import type { CalendarEntry, CalendarFeed } from "../../domain/calendar/calendar-feed";
import { EducationNationaleSource } from "./education-nationale.source";
import { JsonClient } from "./json-client";
import { NagerDateSource } from "./nager-date.source";
import { OpenHolidaysSource } from "./open-holidays.source";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

/** Routes each feed to the official source that publishes it. */
export class OfficialCalendarSource implements ISchoolCalendarSource {
  private readonly france: EducationNationaleSource;
  private readonly openHolidays: OpenHolidaysSource;
  private readonly nagerDate: NagerDateSource;

  constructor(instrumentation: IInstrumentation, fetchImpl: typeof fetch) {
    const http = new JsonClient(instrumentation, fetchImpl);
    this.france = new EducationNationaleSource(http, instrumentation);
    this.openHolidays = new OpenHolidaysSource(http, instrumentation);
    this.nagerDate = new NagerDateSource(http, instrumentation);
  }

  entries(feed: CalendarFeed, period: string): Outcome<CalendarEntry[]> {
    switch (feed.provider) {
      case "education-nationale":
        return this.france.holidays(feed.zone, period);
      case "api-gouv":
        return this.france.bankHolidays(feed.territory, period);
      case "openholidays":
        return this.openHolidays.holidays(feed.country, period);
      case "nager-date":
        return this.nagerDate.publicHolidays(feed.country, period);
    }
  }

  regions(country: string): Outcome<Region[]> {
    return this.openHolidays.regions(country);
  }
}
