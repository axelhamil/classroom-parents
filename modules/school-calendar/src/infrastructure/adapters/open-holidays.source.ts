import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { z } from "zod";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { Region } from "../../application/ports/school-calendar-source.port";
import type { CalendarEntry, HolidayNames } from "../../domain/calendar/calendar-feed";
import type { JsonClient } from "./json-client";

const API_URL = "https://openholidaysapi.org";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

const localizedText = z.array(z.object({ language: z.string(), text: z.string() }));
const codes = z.array(z.object({ code: z.string() })).optional();

const holidaysResponse = z.array(
  z.object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    name: localizedText,
    comment: localizedText.optional(),
    nationwide: z.boolean(),
    subdivisions: codes,
    groups: codes,
  }),
);

type OpenHoliday = z.infer<typeof holidaysResponse>[number];

const regionsResponse = z.array(z.object({ code: z.string(), name: localizedText }));

function namesOf(texts: z.infer<typeof localizedText>): HolidayNames {
  return Object.fromEntries(texts.map(({ language, text }) => [language.toLowerCase(), text]));
}

function namedWithComment({ name, comment }: OpenHoliday): HolidayNames {
  const names = namesOf(name);
  const notes = namesOf(comment ?? []);

  return Object.fromEntries(
    Object.entries(names).map(([language, text]) => {
      const note = notes[language] ?? notes.en;
      return [language, note ? `${text} (${note})` : text];
    }),
  );
}

function entryOf(holiday: OpenHoliday): CalendarEntry {
  const regions = [...(holiday.subdivisions ?? []), ...(holiday.groups ?? [])].map(
    ({ code }) => code,
  );

  return {
    names: namedWithComment(holiday),
    startsOn: holiday.startDate,
    endsOn: holiday.endDate,
    regions: holiday.nationwide ? null : regions,
  };
}

/**
 * School holidays of the countries OpenHolidays covers (openholidaysapi.org, ODbL), fetched per
 * calendar year for the whole country so one copy serves every region. `endDate` is inclusive.
 */
export class OpenHolidaysSource {
  constructor(
    private readonly http: JsonClient,
    private readonly instrumentation: IInstrumentation,
  ) {}

  holidays(country: string, year: string): Outcome<CalendarEntry[]> {
    const params = new URLSearchParams({
      countryIsoCode: country,
      validFrom: `${year}-01-01`,
      validTo: `${year}-12-31`,
    });

    return this.instrumentation.startSpan({ name: "OpenHolidaysSource > holidays" }, async () =>
      (
        await this.http.get("holidays", `${API_URL}/SchoolHolidays?${params}`, holidaysResponse)
      ).map((holidays) => holidays.map(entryOf)),
    );
  }

  regions(country: string): Outcome<Region[]> {
    const params = new URLSearchParams({ countryIsoCode: country });

    return this.instrumentation.startSpan({ name: "OpenHolidaysSource > regions" }, async () => {
      const [subdivisions, groups] = await Promise.all([
        this.http.get("subdivisions", `${API_URL}/Subdivisions?${params}`, regionsResponse),
        this.http.get("groups", `${API_URL}/Groups?${params}`, regionsResponse),
      ]);
      if (subdivisions.isFailure) return Result.fail(subdivisions.getError());
      if (groups.isFailure) return Result.fail(groups.getError());

      return Result.ok(
        [...subdivisions.getValue(), ...groups.getValue()].map(({ code, name }) => ({
          code,
          names: namesOf(name),
        })),
      );
    });
  }
}
