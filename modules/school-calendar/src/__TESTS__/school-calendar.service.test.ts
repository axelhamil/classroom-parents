import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { sourceFailure } from "../application/errors/school-calendar-errors";
import type { ISchoolCalendarCache } from "../application/ports/school-calendar-cache.port";
import type { ISchoolCalendarSource } from "../application/ports/school-calendar-source.port";
import type { ISchoolZoneRepository } from "../application/ports/school-zone-repository.port";
import { OfficialCalendarService } from "../application/services/official-calendar.service";
import { SchoolCalendarService } from "../application/services/school-calendar.service";
import { SchoolZone } from "../domain/value-objects/school-zone.vo";
import { fakeSchoolCalendarSource } from "../testing/fake-school-calendar.source";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const LAST_MONTH = new Date("2026-10-01T10:00:00.000Z");
const YESTERDAY = new Date("2026-11-18T10:00:00.000Z");
const CHRISTMAS = { from: "2026-12-14", to: "2027-01-10" };
const NOEL_2026 = { name: "Vacances de Noël", startsOn: "2026-12-19", endsOn: "2027-01-03" };

const zoneB = SchoolZone.create("zone-b").getValue();
const official = fakeSchoolCalendarSource();

let zones: PortMock<ISchoolZoneRepository>;
let source: PortMock<ISchoolCalendarSource>;
let cache: PortMock<ISchoolCalendarCache>;
let outbox: PortMock<IOutboxRepository>;
let service: SchoolCalendarService;

beforeEach(() => {
  zones = mockPort<ISchoolZoneRepository>();
  source = mockPort<ISchoolCalendarSource>();
  cache = mockPort<ISchoolCalendarCache>();
  outbox = mockPort<IOutboxRepository>();

  zones.zoneOf.mockResolvedValue(Result.ok(Option.some(zoneB)));
  zones.save.mockResolvedValue(Result.ok());
  zones.clear.mockResolvedValue(Result.ok());
  source.holidays.mockImplementation(official.holidays);
  source.bankHolidays.mockImplementation(official.bankHolidays);
  cache.holidays.mockResolvedValue(Result.ok(Option.none()));
  cache.bankHolidays.mockResolvedValue(Result.ok(Option.none()));
  cache.saveHolidays.mockResolvedValue(Result.ok());
  cache.saveBankHolidays.mockResolvedValue(Result.ok());

  const instrumentation = mockInstrumentation();
  service = new SchoolCalendarService(
    zones,
    new OfficialCalendarService(source, cache, instrumentation, () => NOW),
    mockUnitOfWork().unitOfWork,
    outbox,
    instrumentation,
    () => NOW,
  );
});

function sourceDown(): void {
  source.holidays.mockResolvedValue(Result.fail(sourceFailure("holidays")));
  source.bankHolidays.mockResolvedValue(Result.fail(sourceFailure("bankHolidays")));
}

describe("school holidays of the parent's zone", () => {
  it("given a parent who never chose a zone, then the calendar is empty and says so", async () => {
    zones.zoneOf.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue()).toEqual({ zone: null, holidays: [], bankHolidays: [] });
    expect(source.holidays).not.toHaveBeenCalled();
  });

  it("given zone B around Christmas 2026, then the Christmas holidays and the bank holidays of both years are listed", async () => {
    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue()).toEqual({
      zone: "zone-b",
      holidays: [NOEL_2026],
      bankHolidays: [
        { date: "2026-12-25", name: "Jour de Noël" },
        { date: "2027-01-01", name: "1er janvier" },
      ],
    });
    expect(cache.saveHolidays).toHaveBeenCalledWith(
      zoneB,
      "2026-2027",
      expect.arrayContaining([NOEL_2026]),
      NOW,
    );
  });

  it("given a range across the start of the school year, then the summer of the year ending and the autumn of the next are both listed", async () => {
    const result = await service.calendar(PARENT, { from: "2026-08-20", to: "2026-10-20" });

    expect(result.getValue().holidays).toEqual([
      { name: "Vacances d'Été", startsOn: "2026-07-04", endsOn: "2026-08-31" },
      { name: "Vacances de la Toussaint", startsOn: "2026-10-17", endsOn: "2026-11-01" },
    ]);
  });

  it("given a range starting in September, then a summer of the previous school year still running is listed", async () => {
    const result = await service.calendar(PARENT, { from: "2027-09-01", to: "2027-09-30" });

    expect(result.getValue().holidays).toEqual([
      { name: "Vacances d'Été", startsOn: "2027-07-03", endsOn: "2027-09-01" },
    ]);
  });

  it("given a calendar cached yesterday, then the official source is not called", async () => {
    cache.holidays.mockResolvedValue(
      Result.ok(Option.some({ entries: [NOEL_2026], fetchedAt: YESTERDAY })),
    );
    cache.bankHolidays.mockResolvedValue(
      Result.ok(Option.some({ entries: [], fetchedAt: YESTERDAY })),
    );

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([NOEL_2026]);
    expect(source.holidays).not.toHaveBeenCalled();
    expect(source.bankHolidays).not.toHaveBeenCalled();
  });

  it("given the official source is down and an old copy is cached, then the old copy is served", async () => {
    sourceDown();
    cache.holidays.mockResolvedValue(
      Result.ok(Option.some({ entries: [NOEL_2026], fetchedAt: LAST_MONTH })),
    );
    cache.bankHolidays.mockImplementation(async (_territory, year) =>
      Result.ok(
        Option.some({
          entries: year === 2026 ? [{ date: "2026-12-25", name: "Jour de Noël" }] : [],
          fetchedAt: LAST_MONTH,
        }),
      ),
    );

    const result = await service.calendar(PARENT, CHRISTMAS);

    expect(result.getValue().holidays).toEqual([NOEL_2026]);
    expect(result.getValue().bankHolidays).toEqual([{ date: "2026-12-25", name: "Jour de Noël" }]);
    expect(cache.saveHolidays).not.toHaveBeenCalled();
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

describe("school zone of the parent", () => {
  it("given a parent choosing zone C, then the choice is stored and announced with the parent as actor", async () => {
    zones.zoneOf.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.setZone(PARENT, "zone-c");

    expect(result.getValue().zone).toBe("zone-c");
    expect(zones.save).toHaveBeenCalledWith(PARENT, SchoolZone.create("zone-c").getValue(), NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.SCHOOL_ZONE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, zone: "zone-c" },
      },
    ]);
  });

  it("given a parent clearing the zone, then the choice is removed and announced", async () => {
    const result = await service.setZone(PARENT, null);

    expect(result.getValue().zone).toBeNull();
    expect(zones.clear).toHaveBeenCalledWith(PARENT);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.SCHOOL_ZONE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, zone: null },
      },
    ]);
  });

  it("given the zone already in force, then nothing is written nor announced", async () => {
    const result = await service.setZone(PARENT, "zone-b");

    expect(result.getValue().zone).toBe("zone-b");
    expect(zones.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an academy, then the zone it proposes is listed with it", async () => {
    const result = await service.zone(PARENT);

    expect(result.getValue().academies).toContainEqual({
      id: "rennes",
      name: "Rennes",
      zone: "zone-b",
    });
  });
});
