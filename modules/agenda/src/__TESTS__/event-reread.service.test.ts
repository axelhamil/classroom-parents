import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IChildOwnership } from "../application/ports/child-ownership.port";
import type { IEventRepository } from "../application/ports/event-repository.port";
import type { IngestedEvent } from "../application/services/event-ingest.service";
import { EventRereadService, type RereadInput } from "../application/services/event-reread.service";
import type { AgendaEvent } from "../domain/event.aggregate";
import { agendaEvent, CHILD, PARENT } from "../testing/agenda-event.fixture";

const QUOTE = "Merci de signer l'autorisation et d'apporter un maillot.";

function reading(overrides: Partial<IngestedEvent> = {}): IngestedEvent {
  return {
    title: "Contrôle de maths",
    description: "Chapitre 3",
    category: "assessment",
    deadlineDate: "2026-11-19",
    needsReview: false,
    reviewReasons: [],
    evidence: { quote: QUOTE, start: 0, end: QUOTE.length, before: "", after: "" },
    parentActions: [
      {
        kind: "sign",
        label: "Signer l'autorisation",
        amountCents: null,
        currency: null,
        quote: QUOTE,
      },
    ],
    toBring: [{ item: "maillot", quote: QUOTE }],
    ...overrides,
  };
}

const input = (events: IngestedEvent[]): RereadInput => ({
  userId: PARENT,
  childId: CHILD,
  announcementId: "announcement-1",
  events,
});

let repo: PortMock<IEventRepository>;
let outbox: PortMock<IOutboxRepository>;
let service: EventRereadService;
let stored: AgendaEvent;

beforeEach(() => {
  repo = mockPort<IEventRepository>();
  outbox = mockPort<IOutboxRepository>();
  const children = mockPort<IChildOwnership>();
  children.isOwnedBy.mockResolvedValue(Result.ok(true));
  stored = agendaEvent();
  repo.lockAnnouncementItems.mockImplementation(async () => Result.ok([stored]));
  repo.save.mockResolvedValue(Result.ok());

  service = new EventRereadService(
    repo,
    children,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
  );
});

describe("EventRereadService", () => {
  it("given a dry run, when a reading brings a preparation, then it is counted and nothing is written", async () => {
    const result = await service.preview(input([reading()]));

    expect(result.getValue()).toEqual({ matched: 1, changed: 1, unmatched: 0 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an apply, when a reading brings a preparation, then the deadline is saved and announced as a system update", async () => {
    const result = await service.apply(input([reading()]));

    expect(result.getValue()).toEqual({ matched: 1, changed: 1, unmatched: 0 });
    expect(stored.get("preparation").value.toBring).toEqual([{ item: "maillot", quote: QUOTE }]);
    expect(stored.get("evidence").isSome()).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_UPDATED,
        aggregateId: stored.id.value,
        payload: {
          userId: PARENT,
          eventId: stored.id.value,
          fields: ["evidence", "preparation"],
          actorUserId: null,
        },
      },
    ]);
  });

  it("given a reading at another day, then the stored deadline is neither moved nor enriched", async () => {
    const result = await service.apply(input([reading({ deadlineDate: "2026-11-20" })]));

    expect(result.getValue()).toEqual({ matched: 0, changed: 0, unmatched: 1 });
    expect(stored.get("preparation").value.parentActions).toEqual([]);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
