import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { sourceFailure } from "../application/errors/school-calendar-errors";
import type { IOwnPeriodRepository } from "../application/ports/own-period-repository.port";
import type { IParentPreferences } from "../application/ports/parent-preferences.port";
import type { ISchoolCalendarCache } from "../application/ports/school-calendar-cache.port";
import type { ISchoolCalendarChoiceRepository } from "../application/ports/school-calendar-choice-repository.port";
import type { ISchoolCalendarSource } from "../application/ports/school-calendar-source.port";
import { HolidayReader } from "../application/services/holiday-reader.service";
import { OfficialCalendarService } from "../application/services/official-calendar.service";
import { SchoolCalendarService } from "../application/services/school-calendar.service";
import {
  SchoolCalendarChoice,
  type SchoolCalendarChoiceValue,
} from "../domain/calendar/school-calendar-choice.vo";
import { fakeSchoolCalendarSource } from "../testing/fake-school-calendar.source";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const LAST_MONTH = new Date("2026-10-01T10:00:00.000Z");
const YESTERDAY = new Date("2026-11-18T10:00:00.000Z");
const CHRISTMAS = { from: "2026-12-14", to: "2027-01-10" };
const NOEL_2026 = { name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" };
const NOEL_ENTRY = { names: { fr: NOEL_2026.name }, ...NOEL_2026, regions: null };

const official = fakeSchoolCalendarSource();

let choices: PortMock<ISchoolCalendarChoiceRepository>;
let periods: PortMock<IOwnPeriodRepository>;
let preferences: PortMock<IParentPreferences>;
let source: PortMock<ISchoolCalendarSource>;
let cache: PortMock<ISchoolCalendarCache>;
let service: SchoolCalendarService;

function chosen(value: SchoolCalendarChoiceValue): void {
  choices.choiceOf.mockResolvedValue(
    Result.ok(Option.some(SchoolCalendarChoice.create(value).getValue())),
  );
}

function sourceDown(): void {
  source.entries.mockResolvedValue(Result.fail(sourceFailure("entries")));
}

beforeEach(() => {
  choices = mockPort<ISchoolCalendarChoiceRepository>();
  periods = mockPort<IOwnPeriodRepository>();
  preferences = mockPort<IParentPreferences>();
  source = mockPort<ISchoolCalendarSource>();
  cache = mockPort<ISchoolCalendarCache>();

  chosen({ country: "FR", region: "zone-b", schoolHolidays: "official" });
  periods.periodsOf.mockResolvedValue(Result.ok([]));
  preferences.of.mockResolvedValue({ country: null, language: "fr" });
  source.entries.mockImplementation(official.entries);
  source.regions.mockImplementation(official.regions);
  cache.entries.mockResolvedValue(Result.ok(Option.none()));
  cache.saveEntries.mockResolvedValue(Result.ok());
  cache.regions.mockResolvedValue(Result.ok(Option.none()));
  cache.saveRegions.mockResolvedValue(Result.ok());

  const instrumentation = mockInstrumentation();
  const officialCalendars = new OfficialCalendarService(source, cache, instrumentation, () => NOW);
  service = new SchoolCalendarService(
    choices,
    periods,
    officialCalendars,
    new HolidayReader(officialCalendars, periods, instrumentation),
    preferences,
    instrumentation,
    () => NOW,
  );
});

describe("holidays of the parent's school calendar", () => {
  it("given a parent who never chose a calendar, then the calendar is empty and says it is not covered", async () => {
    choices.choiceOf.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue()).toEqual({
      choice: null,
      holidays: [],
      bankHolidays: [],
      schoolHolidaysCovered: false,
    });
    expect(source.entries).not.toHaveBeenCalled();
  });

  it("given French zone B around Christmas 2026, then the Christmas holidays and the bank holidays of both years are listed", async () => {
    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue()).toEqual({
      choice: {
        country: "FR",
        region: "zone-b",
        schoolHolidays: "official",
        source: "education-nationale",
      },
      holidays: [NOEL_2026],
      bankHolidays: [
        { date: "2026-12-25", name: "Jour de Noël" },
        { date: "2027-01-01", name: "1er janvier" },
      ],
      schoolHolidaysCovered: true,
    });
  });

  it("given a range across the start of the school year, then the summer ending and the autumn starting are both listed", async () => {
    const result = await service.calendar(PARENT, { from: "2026-08-20", to: "2026-10-20" });

    expect(result.getValue().holidays).toEqual([
      { name: "Vacances d'Été", startsOn: "2026-07-04", endsOn: "2026-08-31" },
      { name: "Vacances de la Toussaint", startsOn: "2026-10-17", endsOn: "2026-11-01" },
    ]);
  });

  it("given a family in Geneva, then the Geneva school holidays and the Swiss and Geneva bank holidays are listed in French", async () => {
    chosen({ country: "CH", region: "CH-GE", schoolHolidays: "official" });

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([
      { name: "Vacances de Noël et Nouvel An", startsOn: "2026-12-24", endsOn: "2027-01-08" },
    ]);
    expect(result.getValue().bankHolidays).toEqual([
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2026-12-31", name: "Restoration Day" },
      { date: "2027-01-01", name: "New Year's Day" },
    ]);
    expect(result.getValue().schoolHolidaysCovered).toBe(true);
  });

  it("given a Swiss canton without published holidays, then only the national bank holidays are listed and the school holidays are not covered", async () => {
    chosen({ country: "CH", region: "CH-VD", schoolHolidays: "official" });

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([]);
    expect(result.getValue().bankHolidays.map(({ date }) => date)).toEqual([
      "2026-12-25",
      "2027-01-01",
    ]);
    expect(result.getValue().schoolHolidaysCovered).toBe(false);
  });

  it("given a family in Morocco who does not know its school holidays, then the bank holidays are still listed", async () => {
    chosen({ country: "MA", region: null, schoolHolidays: "unknown" });

    const result = await service.calendar(PARENT, { from: "2026-11-01", to: "2026-11-30" });

    expect(result.getValue()).toMatchObject({
      choice: { country: "MA", source: "none" },
      holidays: [],
      bankHolidays: [
        { date: "2026-11-06", name: "Green March" },
        { date: "2026-11-18", name: "Independence Day" },
      ],
      schoolHolidaysCovered: false,
    });
  });

  it("given a parent who entered their own periods, then those periods are the school holidays", async () => {
    chosen({ country: "US", region: null, schoolHolidays: "own" });
    periods.periodsOf.mockResolvedValue(
      Result.ok([
        {
          id: "p1",
          name: "Winter break",
          startsOn: "2026-12-21",
          endsOn: "2027-01-01",
          origin: "ics",
        },
        {
          id: "p2",
          name: "Spring break",
          startsOn: "2027-03-22",
          endsOn: "2027-03-26",
          origin: "manual",
        },
      ]),
    );

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([
      { name: "Winter break", startsOn: "2026-12-21", endsOn: "2027-01-01" },
    ]);
    expect(result.getValue().bankHolidays).toEqual([
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2027-01-01", name: "New Year's Day" },
    ]);
    expect(result.getValue().schoolHolidaysCovered).toBe(true);
  });

  it("given a country whose holidays are not published yet, then the school holidays are not covered", async () => {
    chosen({ country: "ES", region: "ES-MD", schoolHolidays: "official" });

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([]);
    expect(result.getValue().schoolHolidaysCovered).toBe(false);
  });

  it("given a calendar cached yesterday, then the official source is not called", async () => {
    cache.entries.mockResolvedValue(
      Result.ok(Option.some({ entries: [NOEL_ENTRY], fetchedAt: YESTERDAY })),
    );

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([NOEL_2026]);
    expect(source.entries).not.toHaveBeenCalled();
  });

  it("given the official source is down and an old copy is cached, then the old copy is served", async () => {
    sourceDown();
    cache.entries.mockResolvedValue(
      Result.ok(Option.some({ entries: [NOEL_ENTRY], fetchedAt: LAST_MONTH })),
    );

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([NOEL_2026]);
    expect(cache.saveEntries).not.toHaveBeenCalled();
  });

  it("given the official source is down and nothing is cached, then the calendar is unavailable", async () => {
    sourceDown();

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_UNAVAILABLE");
  });

  it("given a range longer than 400 days, then it is refused", async () => {
    const result = await service.calendar(PARENT, { from: "2026-01-01", to: "2027-06-01" });

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_RANGE_INVALID");
  });
});

describe("choosing a school calendar", () => {
  it("given a parent whose country is set in their preferences, then that country is suggested", async () => {
    preferences.of.mockResolvedValue({ country: "CH", language: "fr" });

    const result = await service.settings(PARENT);

    expect(result.getValue().suggestedCountry).toBe("CH");
    expect(result.getValue().countries).toContainEqual({
      code: "MA",
      officialSchoolHolidays: false,
      bankHolidays: true,
    });
  });

  it("given France, then the regions are its school zones", async () => {
    const result = await service.regions(PARENT, "FR");

    expect(result.getValue()).toContainEqual({ code: "zone-b", name: "Zone B" });
  });

  it("given Switzerland, then the cantons are named in the parent's language", async () => {
    preferences.of.mockResolvedValue({ country: null, language: "de" });

    const result = await service.regions(PARENT, "CH");

    expect(result.getValue()).toEqual([
      { code: "CH-GE", name: "Genf" },
      { code: "CH-VD", name: "Waadt" },
      { code: "CH-ZH", name: "Zürich" },
    ]);
  });

  it("given an unknown country, then its regions are refused", async () => {
    const result = await service.regions(PARENT, "XX");

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_COUNTRY_INVALID");
  });

  it("given Geneva before saving, then the preview shows the next three holidays and the next bank holiday", async () => {
    const result = await service.preview(PARENT, { country: "CH", region: "CH-GE" });

    expect(result.getValue()).toEqual({
      holidays: [
        { name: "Vacances de Noël et Nouvel An", startsOn: "2026-12-24", endsOn: "2027-01-08" },
        { name: "Vacances de février", startsOn: "2027-02-15", endsOn: "2027-02-19" },
        { name: "Vacances de Pâques", startsOn: "2027-03-26", endsOn: "2027-04-09" },
      ],
      bankHoliday: { date: "2026-12-25", name: "Christmas Day" },
      schoolHolidaysCovered: true,
    });
  });
});
