import { describe, expect, it } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { OfficialCalendarSource } from "../infrastructure/adapters/official-calendar.source";

function answering(body: unknown, status = 200): typeof fetch {
  return Object.assign(async () => new Response(JSON.stringify(body), { status }), {
    preconnect: fetch.preconnect,
  });
}

function sourceAnswering(body: unknown, status = 200): OfficialCalendarSource {
  return new OfficialCalendarSource(mockInstrumentation(), answering(body, status));
}

const period = (description: string, start: string, end: string, population = "-") => ({
  description,
  start_date: start,
  end_date: end,
  population,
});

describe("official calendars read from the open data APIs", () => {
  it("given the French dataset rows of zone B, then each period runs from its first to its last day off in Paris time, for pupils only", async () => {
    const source = sourceAnswering({
      results: [
        period("Vacances de Noël", "2026-12-18T23:00:00+00:00", "2027-01-03T23:00:00+00:00"),
        period("Pont de l'Ascension", "2027-05-06T22:00:00+00:00", "2027-05-06T22:00:00+00:00"),
        period(
          "Vacances d'Été",
          "2027-07-02T22:00:00+00:00",
          "2027-08-31T22:00:00+00:00",
          "Enseignants",
        ),
      ],
    });

    const result = await source.entries(
      { provider: "education-nationale", zone: "zone-b" },
      "2026-2027",
    );

    expect(result.getValue()).toEqual([
      {
        names: { fr: "Vacances de Noël" },
        startsOn: "2026-12-19",
        endsOn: "2027-01-03",
        regions: null,
      },
      {
        names: { fr: "Pont de l'Ascension" },
        startsOn: "2027-05-07",
        endsOn: "2027-05-07",
        regions: null,
      },
    ]);
  });

  it("given OpenHolidays rows, then names keep every language with their note, and regional rows keep their subdivisions and groups", async () => {
    const source = sourceAnswering([
      {
        startDate: "2026-06-06",
        endDate: "2026-09-10",
        name: [
          { language: "PT", text: "Férias de verão" },
          { language: "EN", text: "Summer holidays" },
        ],
        comment: [{ language: "EN", text: "9th grade" }],
        nationwide: true,
      },
      {
        startDate: "2026-10-19",
        endDate: "2026-11-01",
        name: [{ language: "FR", text: "Congé d'automne" }],
        nationwide: false,
        groups: [{ code: "BE-FR" }],
      },
    ]);

    const result = await source.entries({ provider: "openholidays", country: "PT" }, "2026");

    expect(result.getValue()).toEqual([
      {
        names: { pt: "Férias de verão (9th grade)", en: "Summer holidays (9th grade)" },
        startsOn: "2026-06-06",
        endsOn: "2026-09-10",
        regions: null,
      },
      {
        names: { fr: "Congé d'automne" },
        startsOn: "2026-10-19",
        endsOn: "2026-11-01",
        regions: ["BE-FR"],
      },
    ]);
  });

  it("given Nager.Date rows, then only public days off are kept, with their subdivisions", async () => {
    const source = sourceAnswering([
      {
        date: "2026-12-25",
        name: "Christmas Day",
        nationalHoliday: true,
        subdivisionCodes: null,
        holidayTypes: ["Public"],
      },
      {
        date: "2026-12-31",
        name: "Restoration Day",
        nationalHoliday: false,
        subdivisionCodes: ["CH-GE"],
        holidayTypes: ["Public"],
      },
      {
        date: "2026-02-14",
        name: "Valentine's Day",
        nationalHoliday: true,
        subdivisionCodes: null,
        holidayTypes: ["Observance"],
      },
    ]);

    const result = await source.entries({ provider: "nager-date", country: "CH" }, "2026");

    expect(result.getValue()).toEqual([
      {
        names: { en: "Christmas Day" },
        startsOn: "2026-12-25",
        endsOn: "2026-12-25",
        regions: null,
      },
      {
        names: { en: "Restoration Day" },
        startsOn: "2026-12-31",
        endsOn: "2026-12-31",
        regions: ["CH-GE"],
      },
    ]);
  });

  it("given the source answers an error, then the read fails as a provider failure", async () => {
    const result = await sourceAnswering({ error: "down" }, 503).entries(
      { provider: "api-gouv", territory: "metropole" },
      "2026",
    );

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_PROVIDER_FAILURE");
  });
});
