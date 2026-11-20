import type { IInstrumentation, Result } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { z } from "zod";
import type { SchoolCalendarError } from "../../application/errors/school-calendar-errors";
import type { CalendarEntry } from "../../domain/calendar/calendar-feed";
import type {
  BankHolidayTerritory,
  SchoolZoneValue,
} from "../../domain/value-objects/school-zone.vo";
import type { JsonClient } from "./json-client";

const SCHOOL_HOLIDAYS_URL =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
const BANK_HOLIDAYS_URL = "https://calendrier.api.gouv.fr/jours-feries";
const PERIOD_FIELDS = "description,start_date,end_date,population";
const MAX_PERIODS = 100;
const TEACHERS_ONLY = /^enseignants/i;

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

const DATASET_ZONE: Record<SchoolZoneValue, string> = {
  "zone-a": "Zone A",
  "zone-b": "Zone B",
  "zone-c": "Zone C",
  corse: "Corse",
  guadeloupe: "Guadeloupe",
  guyane: "Guyane",
  martinique: "Martinique",
  mayotte: "Mayotte",
  reunion: "Réunion",
};

const periodsResponse = z.object({
  results: z.array(
    z.object({
      description: z.string().min(1),
      start_date: z.iso.datetime({ offset: true }),
      end_date: z.iso.datetime({ offset: true }),
      population: z.string().nullable(),
    }),
  ),
});

type DatasetPeriod = z.infer<typeof periodsResponse>["results"][number];

const bankHolidaysResponse = z.record(z.iso.date(), z.string().min(1));

function parisDateOf(instant: string): string {
  return utcToZonedWall(new Date(instant), PARIS_TIME_ZONE)
    .map(({ date }) => date)
    .unwrapOr(instant.slice(0, 10));
}

function entryOf(period: DatasetPeriod): CalendarEntry {
  const startsOn = parisDateOf(period.start_date);
  const resumesOn = parisDateOf(period.end_date);

  return {
    names: { fr: period.description },
    startsOn,
    endsOn: resumesOn > startsOn ? shiftDate(resumesOn, -1) : startsOn,
    regions: null,
  };
}

function forPupils(period: DatasetPeriod): boolean {
  return !TEACHERS_ONLY.test(period.population ?? "");
}

function periodsUrl(zone: SchoolZoneValue, schoolYear: string): string {
  const params = new URLSearchParams({
    select: PERIOD_FIELDS,
    group_by: PERIOD_FIELDS,
    where: `zones="${DATASET_ZONE[zone]}" and annee_scolaire="${schoolYear}"`,
    limit: String(MAX_PERIODS),
  });

  return `${SCHOOL_HOLIDAYS_URL}?${params.toString()}`;
}

/**
 * French school holidays (data.education.gouv.fr, `fr-en-calendrier-scolaire`) and bank holidays
 * (calendrier.api.gouv.fr), both under the Licence Ouverte 2.0. `end_date` is the day classes
 * resume, so the last day off is the day before, except a one-day bridge where start equals end.
 */
export class EducationNationaleSource {
  constructor(
    private readonly http: JsonClient,
    private readonly instrumentation: IInstrumentation,
  ) {}

  holidays(zone: SchoolZoneValue, schoolYear: string): Outcome<CalendarEntry[]> {
    return this.instrumentation.startSpan(
      { name: "EducationNationaleSource > holidays" },
      async () =>
        (await this.http.get("holidays", periodsUrl(zone, schoolYear), periodsResponse)).map(
          ({ results }) => results.filter(forPupils).map(entryOf),
        ),
    );
  }

  bankHolidays(territory: BankHolidayTerritory, year: string): Outcome<CalendarEntry[]> {
    return this.instrumentation.startSpan(
      { name: "EducationNationaleSource > bankHolidays" },
      async () =>
        (
          await this.http.get(
            "bankHolidays",
            `${BANK_HOLIDAYS_URL}/${territory}/${year}.json`,
            bankHolidaysResponse,
          )
        ).map((days) =>
          Object.entries(days).map(([date, name]) => ({
            names: { fr: name },
            startsOn: date,
            endsOn: date,
            regions: null,
          })),
        ),
    );
  }
}
