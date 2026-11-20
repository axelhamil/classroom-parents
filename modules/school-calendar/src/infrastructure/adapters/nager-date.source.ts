import type { IInstrumentation, Result } from "@packages/ddd-kit";
import { z } from "zod";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { CalendarEntry } from "../../domain/calendar/calendar-feed";
import type { JsonClient } from "./json-client";

const API_URL = "https://nagerholidays.com/api/v4/Holidays";
const DAY_OFF = "Public";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

const holidaysResponse = z.array(
  z.object({
    date: z.iso.date(),
    name: z.string().min(1),
    nationalHoliday: z.boolean(),
    subdivisionCodes: z.array(z.string()).nullable(),
    holidayTypes: z.array(z.string()),
  }),
);

type NagerHoliday = z.infer<typeof holidaysResponse>[number];

function entryOf(holiday: NagerHoliday): CalendarEntry {
  return {
    names: { en: holiday.name },
    startsOn: holiday.date,
    endsOn: holiday.date,
    regions: holiday.nationalHoliday ? null : holiday.subdivisionCodes,
  };
}

/**
 * Public holidays of every other country (Nager.Date v4, code under MIT): only the `Public` days
 * off, never observances. Holidays set by the moon (Eid in Morocco) are not published there.
 */
export class NagerDateSource {
  constructor(
    private readonly http: JsonClient,
    private readonly instrumentation: IInstrumentation,
  ) {}

  publicHolidays(country: string, year: string): Outcome<CalendarEntry[]> {
    return this.instrumentation.startSpan({ name: "NagerDateSource > publicHolidays" }, async () =>
      (
        await this.http.get("publicHolidays", `${API_URL}/${country}/${year}`, holidaysResponse)
      ).map((holidays) =>
        holidays.filter(({ holidayTypes }) => holidayTypes.includes(DAY_OFF)).map(entryOf),
      ),
    );
  }
}
