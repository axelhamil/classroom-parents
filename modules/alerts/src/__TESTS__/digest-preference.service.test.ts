import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IWeeklyDigestRepository } from "../application/ports/weekly-digest-repository.port";
import { DigestPreferenceService } from "../application/services/digest-preference.service";
import { PARENT } from "../testing/alert.fixture";

const NOW = new Date("2026-11-12T10:00:00.000Z");

let digests: PortMock<IWeeklyDigestRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: DigestPreferenceService;

beforeEach(() => {
  digests = mockPort<IWeeklyDigestRepository>();
  outbox = mockPort<IOutboxRepository>();
  digests.enabledFor.mockResolvedValue(Result.ok(Option.none()));
  digests.saveEnabled.mockResolvedValue(Result.ok());

  service = new DigestPreferenceService(
    digests,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("weekly digest preference", () => {
  it("given a parent who never chose, then the digest is on", async () => {
    const result = await service.preference(PARENT);

    expect(result.getValue()).toEqual({ enabled: true });
  });

  it("given a parent turning the digest off, then the choice is stored and announced with the parent as actor", async () => {
    const result = await service.setPreference(PARENT, false);

    expect(result.getValue()).toEqual({ enabled: false });
    expect(digests.saveEnabled).toHaveBeenCalledWith(PARENT, false, NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.WEEKLY_DIGEST_PREFERENCE_CHANGED,
        aggregateId: PARENT,
        payload: { userId: PARENT, enabled: false },
      },
    ]);
  });

  it("given the parent sends the value already in force, then nothing is written nor announced", async () => {
    digests.enabledFor.mockResolvedValue(Result.ok(Option.some(false)));

    const result = await service.setPreference(PARENT, false);

    expect(result.getValue()).toEqual({ enabled: false });
    expect(digests.saveEnabled).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
