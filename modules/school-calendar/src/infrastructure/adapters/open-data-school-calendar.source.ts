import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";
import { instrumentedFetch } from "@packages/http/instrumented-fetch";
import { z } from "zod";
import {
  type SchoolCalendarError,
  sourceFailure,
} from "../../application/errors/school-calendar-errors";
import type {
  BankHoliday,
  ISchoolCalendarSource,
  SchoolHoliday,
} from "../../application/ports/school-calendar-source.port";
import type {
  BankHolidayTerritory,
  SchoolZone,
  SchoolZoneValue,
} from "../../domain/value-objects/school-zone.vo";

const SCHOOL_HOLIDAYS_URL =
  "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records";
const BANK_HOLIDAYS_URL = "https://calendrier.api.gouv.fr/jours-feries";
const TIMEOUT_MS = 5_000;
const PERIOD_FIELDS = "description,start_date,end_date,population";
const MAX_PERIODS = 100;
const TEACHERS_ONLY = /^enseignants/i;

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

function holidayOf(period: DatasetPeriod): SchoolHoliday {
  const startsOn = parisDateOf(period.start_date);
  const resumesOn = parisDateOf(period.end_date);

  return {
    name: period.description,
    startsOn,
    endsOn: resumesOn > startsOn ? shiftDate(resumesOn, -1) : startsOn,
  };
}

function forPupils(period: DatasetPeriod): boolean {
  return !TEACHERS_ONLY.test(period.population ?? "");
}

function distinct(holidays: SchoolHoliday[]): SchoolHoliday[] {
  const seen = new Map(holidays.map((h) => [`${h.name}|${h.startsOn}|${h.endsOn}`, h]));

  return [...seen.values()];
}

function periodsUrl(zone: SchoolZone, schoolYear: string): string {
  const params = new URLSearchParams({
    select: PERIOD_FIELDS,
    group_by: PERIOD_FIELDS,
    where: `zones="${DATASET_ZONE[zone.value]}" and annee_scolaire="${schoolYear}"`,
    limit: String(MAX_PERIODS),
  });

  return `${SCHOOL_HOLIDAYS_URL}?${params.toString()}`;
}

export class OpenDataSchoolCalendarSource implements ISchoolCalendarSource {
  constructor(
    private readonly instrumentation: IInstrumentation,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async holidays(
    zone: SchoolZone,
    schoolYear: string,
  ): Promise<Result<SchoolHoliday[], SchoolCalendarError>> {
    return this.instrumentation.startSpan(
      { name: "OpenDataSchoolCalendarSource > holidays" },
      async () =>
        (await this.getJson("holidays", periodsUrl(zone, schoolYear), periodsResponse)).map(
          ({ results }) => distinct(results.filter(forPupils).map(holidayOf)),
        ),
    );
  }

  async bankHolidays(
    territory: BankHolidayTerritory,
    year: number,
  ): Promise<Result<BankHoliday[], SchoolCalendarError>> {
    return this.instrumentation.startSpan(
      { name: "OpenDataSchoolCalendarSource > bankHolidays" },
      async () =>
        (
          await this.getJson(
            "bankHolidays",
            `${BANK_HOLIDAYS_URL}/${territory}/${year}.json`,
            bankHolidaysResponse,
          )
        ).map((days) => Object.entries(days).map(([date, name]) => ({ date, name }))),
    );
  }

  private async getJson<T>(
    operation: string,
    url: string,
    schema: z.ZodType<T>,
  ): Promise<Result<T, SchoolCalendarError>> {
    try {
      const response = await instrumentedFetch(this.instrumentation, this.fetchImpl, url, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.instrumentation.capture(new Error(`${url} answered ${response.status}`));
        return Result.fail(sourceFailure(operation));
      }

      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        this.instrumentation.capture(parsed.error);
        return Result.fail(sourceFailure(operation));
      }
      return Result.ok(parsed.data);
    } catch (err) {
      this.instrumentation.capture(err);
      return Result.fail(sourceFailure(operation));
    }
  }
}
