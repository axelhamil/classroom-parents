import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IPreferenceRepository } from "../application/ports/preference-repository.port";
import { PreferenceService } from "../application/services/preference.service";
import { Country } from "../domain/preferences/value-objects/country.vo";
import { Locale } from "../domain/preferences/value-objects/locale.vo";
import { TimeZone } from "../domain/preferences/value-objects/time-zone.vo";

const PARENT = "parent-1";
const NOW = new Date("2026-11-19T10:00:00.000Z");
const MOROCCO = { locale: "ar", timeZone: "Africa/Casablanca", country: "MA" } as const;

let repository: PortMock<IPreferenceRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: PreferenceService;

beforeEach(() => {
  repository = mockPort<IPreferenceRepository>();
  outbox = mockPort<IOutboxRepository>();

  repository.find.mockResolvedValue(Result.ok(Option.none()));
  repository.save.mockResolvedValue(Result.ok());

  service = new PreferenceService(
    repository,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

function storedMorocco(extractionEnabled: boolean): void {
  repository.find.mockResolvedValue(
    Result.ok(
      Option.some({
        locale: Option.some(Locale.create(MOROCCO.locale).getValue()),
        timeZone: Option.some(TimeZone.create(MOROCCO.timeZone).getValue()),
        country: Option.some(Country.create(MOROCCO.country).getValue()),
        extractionEnabled,
      }),
    ),
  );
}

describe("preferences of a parent", () => {
  it("given a parent who never chose, then nothing is chosen and announcements are read by the AI", async () => {
    const result = await service.preferences(PARENT);

    expect(result.getValue()).toEqual({
      locale: null,
      timeZone: null,
      country: null,
      extractionEnabled: true,
    });
  });

  it("given a language, a time zone and a country, then they are stored and announced once", async () => {
    const result = await service.chooseLanguageAndRegion(PARENT, MOROCCO);

    expect(result.getValue()).toEqual({ ...MOROCCO, extractionEnabled: true });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        eventType: EventTypes.ASSISTANT_PREFERENCE_CHANGED,
        payload: { userId: PARENT, ...MOROCCO, extractionEnabled: true },
      }),
    ]);
  });

  it("given the same choice again, then nothing is written nor announced", async () => {
    storedMorocco(true);

    await service.chooseLanguageAndRegion(PARENT, MOROCCO);

    expect(repository.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an unknown time zone, then the choice is refused and nothing is written", async () => {
    const result = await service.chooseLanguageAndRegion(PARENT, {
      ...MOROCCO,
      timeZone: "Mars/Olympus",
    });

    expect(result.getError()).toMatchObject({
      code: "ASSISTANT_PREFERENCE_INVALID",
      metadata: { field: "timeZone" },
    });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("given a code that is not a country, then the choice is refused", async () => {
    const result = await service.chooseLanguageAndRegion(PARENT, { ...MOROCCO, country: "EU" });

    expect(result.getError().metadata).toEqual({ field: "country" });
  });
});

describe("opposition to the AI reading of announcements", () => {
  it("given a parent who opposes, then the reading is off and the choice keeps their language", async () => {
    storedMorocco(true);

    const result = await service.setExtraction(PARENT, false);

    expect(result.getValue()).toEqual({ ...MOROCCO, extractionEnabled: false });
    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        payload: { userId: PARENT, ...MOROCCO, extractionEnabled: false },
      }),
    ]);
  });

  it("given a parent who opposed, then the reading is reported off", async () => {
    storedMorocco(false);

    expect((await service.extractionEnabled(PARENT)).getValue()).toBe(false);
  });
});
