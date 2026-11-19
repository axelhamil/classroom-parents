import { describe, expect, it } from "bun:test";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { SchoolZone } from "../domain/value-objects/school-zone.vo";
import { OpenDataSchoolCalendarSource } from "../infrastructure/adapters/open-data-school-calendar.source";

const zoneB = SchoolZone.create("zone-b").getValue();

const period = (description: string, start: string, end: string, population = "-") => ({
  description,
  start_date: start,
  end_date: end,
  population,
});

function answering(body: unknown, status = 200): typeof fetch {
  return Object.assign(async () => new Response(JSON.stringify(body), { status }), {
    preconnect: fetch.preconnect,
  });
}

describe("official school calendar read from the open data APIs", () => {
  it("given the dataset rows of zone B, then each period runs from its first to its last day off in Paris time, for pupils only", async () => {
    const source = new OpenDataSchoolCalendarSource(
      mockInstrumentation(),
      answering({
        results: [
          period("Vacances de Noël", "2026-12-18T23:00:00+00:00", "2027-01-03T23:00:00+00:00"),
          period("Pont de l'Ascension", "2027-05-06T22:00:00+00:00", "2027-05-06T22:00:00+00:00"),
          period(
            "Vacances d'Été",
            "2027-07-02T22:00:00+00:00",
            "2027-08-31T22:00:00+00:00",
            "Enseignants",
          ),
          period(
            "Vacances d'Été",
            "2027-07-02T22:00:00+00:00",
            "2027-09-01T22:00:00+00:00",
            "Élèves",
          ),
        ],
      }),
    );

    const result = await source.holidays(zoneB, "2026-2027");

    expect(result.getValue()).toEqual([
      { name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" },
      { name: "Pont de l'Ascension", startsOn: "2027-05-07", endsOn: "2027-05-07" },
      { name: "Vacances d'Été", startsOn: "2027-07-03", endsOn: "2027-09-01" },
    ]);
  });

  it("given the bank holidays of a year, then each date keeps its official name", async () => {
    const source = new OpenDataSchoolCalendarSource(
      mockInstrumentation(),
      answering({ "2026-12-25": "Jour de Noël" }),
    );

    const result = await source.bankHolidays("metropole", 2026);

    expect(result.getValue()).toEqual([{ date: "2026-12-25", name: "Jour de Noël" }]);
  });

  it("given the source answers an error, then the read fails as a provider failure", async () => {
    const source = new OpenDataSchoolCalendarSource(
      mockInstrumentation(),
      answering({ error: "down" }, 503),
    );

    const result = await source.holidays(zoneB, "2026-2027");

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_PROVIDER_FAILURE");
  });
});
