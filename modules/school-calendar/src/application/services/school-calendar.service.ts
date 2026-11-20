import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { shiftDate } from "@packages/ddd-kit/days";
import { ACADEMIES, FRENCH_ZONE_NAMES } from "../../domain/academies";
import { nameIn } from "../../domain/calendar/calendar-feed";
import { COUNTRIES, coverageOf, FRANCE } from "../../domain/calendar/coverage";
import { SchoolCalendarChoice } from "../../domain/calendar/school-calendar-choice.vo";
import { DateRange } from "../../domain/value-objects/date-range.vo";
import { SCHOOL_ZONES } from "../../domain/value-objects/school-zone.vo";
import {
  type CountryDto,
  choiceDtoOf,
  type PreviewDto,
  type PreviewQuery,
  type RegionDto,
  type SchoolCalendarDto,
  type SchoolCalendarQuery,
  type SchoolCalendarSettingsDto,
} from "../dto/school-calendar.dto";
import {
  choiceInvalid,
  countryInvalid,
  rangeInvalid,
  type SchoolCalendarError,
} from "../errors/school-calendar-errors";
import type { IOwnPeriodRepository } from "../ports/own-period-repository.port";
import type { IParentPreferences } from "../ports/parent-preferences.port";
import type { ISchoolCalendarChoiceRepository } from "../ports/school-calendar-choice-repository.port";
import type { HolidayReader } from "./holiday-reader.service";
import type { OfficialCalendarService } from "./official-calendar.service";

type Outcome<T> = Promise<Result<T, SchoolCalendarError>>;

const DEFAULT_LANGUAGE = "fr";
const PREVIEW_DAYS = 365;
const PREVIEW_HOLIDAYS = 3;

const NO_CALENDAR: SchoolCalendarDto = {
  choice: null,
  holidays: [],
  bankHolidays: [],
  schoolHolidaysCovered: false,
};

const COUNTRY_LIST: CountryDto[] = COUNTRIES.map(({ code, schoolHolidays, bankHolidays }) => ({
  code,
  officialSchoolHolidays: schoolHolidays !== null,
  bankHolidays: bankHolidays !== null,
}));

const FRENCH_REGIONS: RegionDto[] = SCHOOL_ZONES.map((zone) => ({
  code: zone,
  name: FRENCH_ZONE_NAMES[zone],
}));

function todayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class SchoolCalendarService {
  constructor(
    private readonly choices: ISchoolCalendarChoiceRepository,
    private readonly periods: IOwnPeriodRepository,
    private readonly official: Pick<OfficialCalendarService, "regions">,
    private readonly reader: HolidayReader,
    private readonly preferences: IParentPreferences,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async calendar(userId: string, query: SchoolCalendarQuery): Outcome<SchoolCalendarDto> {
    return this.span("calendar", async () => {
      const range = DateRange.create(query);
      if (range.isFailure) return Result.fail(rangeInvalid(range.getError()));

      const choice = await this.choices.choiceOf(userId);
      if (choice.isFailure) return Result.fail(choice.getError());
      if (choice.getValue().isNone()) return Result.ok(NO_CALENDAR);

      const reading = {
        choice: choice.getValue().unwrap(),
        range: range.getValue(),
        language: await this.languageOf(userId),
      };

      const school = await this.reader.schoolHolidays(userId, reading);
      if (school.isFailure) return Result.fail(school.getError());

      const bankHolidays = await this.reader.bankHolidays(reading);
      if (bankHolidays.isFailure) return Result.fail(bankHolidays.getError());

      return Result.ok({
        choice: choiceDtoOf(choice.getValue()),
        holidays: school.getValue().holidays,
        bankHolidays: bankHolidays.getValue(),
        schoolHolidaysCovered: school.getValue().covered,
      });
    });
  }

  async settings(userId: string): Outcome<SchoolCalendarSettingsDto> {
    return this.span("settings", async () => {
      const choice = await this.choices.choiceOf(userId);
      if (choice.isFailure) return Result.fail(choice.getError());

      const periods = await this.periods.periodsOf(userId);
      if (periods.isFailure) return Result.fail(periods.getError());

      const { country } = await this.preferences.of(userId);

      return Result.ok({
        choice: choiceDtoOf(choice.getValue()),
        periods: periods.getValue(),
        suggestedCountry: country !== null && coverageOf(country).isSome() ? country : null,
        countries: COUNTRY_LIST,
        academies: ACADEMIES,
      });
    });
  }

  async regions(userId: string, country: string): Outcome<RegionDto[]> {
    return this.span("regions", async () => {
      const coverage = coverageOf(country);
      if (coverage.isNone()) return Result.fail(countryInvalid);
      if (country === FRANCE) return Result.ok(FRENCH_REGIONS);
      if (coverage.unwrap().schoolHolidays !== "openholidays") return Result.ok([]);

      const regions = await this.official.regions(country);
      if (regions.isFailure) return Result.fail(regions.getError());

      const language = await this.languageOf(userId);

      return Result.ok(
        regions
          .getValue()
          .map(({ code, names }) => ({ code, name: nameIn(names, language) }))
          .sort((left, right) => left.name.localeCompare(right.name, language)),
      );
    });
  }

  async preview(userId: string, query: PreviewQuery): Outcome<PreviewDto> {
    return this.span("preview", async () => {
      const official = coverageOf(query.country).filter(
        ({ schoolHolidays }) => schoolHolidays !== null,
      );
      const choice = SchoolCalendarChoice.create({
        country: query.country,
        region: query.region ?? null,
        schoolHolidays: official.isSome() ? "official" : "unknown",
      });
      if (choice.isFailure) return Result.fail(choiceInvalid(choice.getError()));

      const today = todayOf(this.clock());
      const reading = {
        choice: choice.getValue(),
        range: DateRange.create({ from: today, to: shiftDate(today, PREVIEW_DAYS) }).getValue(),
        language: await this.languageOf(userId),
      };

      const school = await this.reader.schoolHolidays(null, reading);
      if (school.isFailure) return Result.fail(school.getError());

      const bankHolidays = await this.reader.bankHolidays(reading);
      if (bankHolidays.isFailure) return Result.fail(bankHolidays.getError());

      return Result.ok({
        holidays: school.getValue().holidays.slice(0, PREVIEW_HOLIDAYS),
        bankHoliday: bankHolidays.getValue()[0] ?? null,
        schoolHolidaysCovered: school.getValue().covered,
      });
    });
  }

  private async languageOf(userId: string): Promise<string> {
    return (await this.preferences.of(userId)).language ?? DEFAULT_LANGUAGE;
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `SchoolCalendarService > ${method}`, op: "function" },
      work,
    );
  }
}
