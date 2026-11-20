import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import { icsUrlInvalid } from "../application/errors/school-calendar-errors";
import type { IIcsDownloader } from "../application/ports/ics-downloader.port";
import type { IOwnPeriodRepository } from "../application/ports/own-period-repository.port";
import type { ISchoolCalendarChoiceRepository } from "../application/ports/school-calendar-choice-repository.port";
import { CalendarChoiceService } from "../application/services/calendar-choice.service";
import { SchoolCalendarChoice } from "../domain/calendar/school-calendar-choice.vo";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const GENEVA = { country: "CH", region: "CH-GE", schoolHolidays: "official" } as const;

const SCHOOL_ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261219",
  "DTEND;VALUE=DATE:20270104",
  "SUMMARY:Winter break",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

let choices: PortMock<ISchoolCalendarChoiceRepository>;
let periods: PortMock<IOwnPeriodRepository>;
let downloader: PortMock<IIcsDownloader>;
let outbox: PortMock<IOutboxRepository>;
let service: CalendarChoiceService;

beforeEach(() => {
  choices = mockPort<ISchoolCalendarChoiceRepository>();
  periods = mockPort<IOwnPeriodRepository>();
  downloader = mockPort<IIcsDownloader>();
  outbox = mockPort<IOutboxRepository>();

  choices.choiceOf.mockResolvedValue(Result.ok(Option.none()));
  choices.save.mockResolvedValue(Result.ok());
  choices.clear.mockResolvedValue(Result.ok());
  periods.add.mockResolvedValue(Result.ok());
  periods.replaceImported.mockResolvedValue(Result.ok(1));
  periods.remove.mockResolvedValue(Result.ok(Option.none()));

  service = new CalendarChoiceService(
    choices,
    periods,
    downloader,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("the parent's school calendar choice", () => {
  it("given a parent choosing Geneva, then the choice is stored and announced with its source", async () => {
    const result = await service.choose(PARENT, GENEVA);

    expect(result.getValue()).toEqual({ ...GENEVA, source: "openholidays" });
    expect(choices.save).toHaveBeenCalledWith(
      PARENT,
      SchoolCalendarChoice.create(GENEVA).getValue(),
      NOW,
    );
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.SCHOOL_CALENDAR_CHOICE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, country: "CH", region: "CH-GE", source: "openholidays" },
      },
    ]);
  });

  it("given the calendar already in force, then nothing is written nor announced", async () => {
    choices.choiceOf.mockResolvedValue(
      Result.ok(Option.some(SchoolCalendarChoice.create(GENEVA).getValue())),
    );

    await service.choose(PARENT, GENEVA);

    expect(choices.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a parent who clears the choice, then it is removed and announced", async () => {
    choices.choiceOf.mockResolvedValue(
      Result.ok(Option.some(SchoolCalendarChoice.create(GENEVA).getValue())),
    );

    const result = await service.choose(PARENT, null);

    expect(result.getValue()).toBeNull();
    expect(choices.clear).toHaveBeenCalledWith(PARENT);
    expect(enqueuedEvents(outbox)[0]?.payload).toEqual({
      userId: PARENT,
      country: null,
      region: null,
      source: null,
    });
  });

  it.each([
    [
      "official holidays for a country that publishes none",
      { country: "MA", region: null, schoolHolidays: "official" },
    ],
    ["a region of another country", { country: "CH", region: "DE-BY", schoolHolidays: "official" }],
    [
      "a French region that is not a zone",
      { country: "FR", region: "FR-IF", schoolHolidays: "official" },
    ],
    ["a country without any calendar", { country: "AQ", region: null, schoolHolidays: "unknown" }],
  ] as const)("given %s, then the choice is refused", async (_, choice) => {
    const result = await service.choose(PARENT, choice);

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_CHOICE_INVALID");
    expect(choices.save).not.toHaveBeenCalled();
  });
});

describe("the parent's own holiday periods", () => {
  it("given a period typed by the parent, then it is stored with a clean name and announced", async () => {
    const result = await service.addPeriod(PARENT, {
      name: "  Aïd\u0000 al-Fitr ",
      startsOn: "2027-03-10",
      endsOn: "2027-03-11",
    });

    expect(result.isSuccess).toBe(true);
    expect(periods.add.mock.calls[0]?.[1].value).toEqual({
      name: "Aïd al-Fitr",
      startsOn: "2027-03-10",
      endsOn: "2027-03-11",
    });
    expect(enqueuedEvents(outbox)[0]?.payload).toEqual({
      userId: PARENT,
      change: "added",
      origin: "manual",
      periods: 1,
    });
  });

  it("given a period ending before it starts, then it is refused", async () => {
    const result = await service.addPeriod(PARENT, {
      name: "Break",
      startsOn: "2027-03-10",
      endsOn: "2027-03-01",
    });

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_PERIOD_INVALID");
  });

  it("given a period of another parent, then removing it is not found and nothing is announced", async () => {
    const result = await service.removePeriod(PARENT, "0190f0b4-0000-7000-8000-000000000000");

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_PERIOD_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a school calendar file, then its periods replace the last import and the import is announced", async () => {
    const result = await service.importIcs(PARENT, { content: SCHOOL_ICS });

    expect(result.getValue()).toEqual({ imported: 1, skipped: 0 });
    expect(periods.replaceImported.mock.calls[0]?.[1].map(({ value }) => value)).toEqual([
      { name: "Winter break", startsOn: "2026-12-19", endsOn: "2027-01-03" },
    ]);
    expect(enqueuedEvents(outbox)[0]?.payload).toEqual({
      userId: PARENT,
      change: "imported",
      origin: "ics",
      periods: 1,
    });
  });

  it("given a link to the school calendar, then the downloaded file is imported", async () => {
    downloader.download.mockResolvedValue(Result.ok(SCHOOL_ICS));

    const result = await service.importIcs(PARENT, { url: "https://school.example/holidays.ics" });

    expect(result.getValue().imported).toBe(1);
    expect(downloader.download).toHaveBeenCalledWith("https://school.example/holidays.ics");
  });

  it("given a link the downloader refuses, then nothing is replaced", async () => {
    downloader.download.mockResolvedValue(Result.fail(icsUrlInvalid("not a public host")));

    const result = await service.importIcs(PARENT, { url: "https://intranet.example/x.ics" });

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_ICS_URL_INVALID");
    expect(periods.replaceImported).not.toHaveBeenCalled();
  });

  it("given a file that is not a calendar, then it is refused and nothing is replaced", async () => {
    const result = await service.importIcs(PARENT, { content: "<html>holidays</html>" });

    expect(result.getError().code).toBe("SCHOOL_CALENDAR_ICS_INVALID");
    expect(periods.replaceImported).not.toHaveBeenCalled();
  });
});
