import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { IAlertPlanner } from "../application/ports/alert-planner.port";
import type { IChildOwnership } from "../application/ports/child-ownership.port";
import type { IEventRepository } from "../application/ports/event-repository.port";
import {
  EventIngestService,
  type IngestedEvent,
} from "../application/services/event-ingest.service";
import type { AgendaEvent } from "../domain/event.aggregate";
import { CHILD, PARENT } from "../testing/agenda-event.fixture";

const announcement = {
  id: "announcement-1",
  courseId: "course-1",
  url: "https://classroom.google.com/c/course-1/p/announcement-1",
  publishedAt: new Date("2026-11-09T07:00:00.000Z"),
};

function extracted(overrides: Partial<IngestedEvent> = {}): IngestedEvent {
  return {
    title: "Contrôle de maths",
    description: "Chapitre 3",
    category: "assessment",
    deadlineDate: "2026-11-19",
    needsReview: false,
    ...overrides,
  };
}

let repo: PortMock<IEventRepository>;
let planner: PortMock<IAlertPlanner>;
let children: PortMock<IChildOwnership>;
let outbox: PortMock<IOutboxRepository>;
let uow: UnitOfWorkMock;
let service: EventIngestService;
let stored: Map<string, AgendaEvent>;

const keyOf = (event: AgendaEvent) =>
  `${event.get("childId")}|${event.get("announcementId")}|${event.get("ordinal")}`;

beforeEach(() => {
  repo = mockPort<IEventRepository>();
  planner = mockPort<IAlertPlanner>();
  children = mockPort<IChildOwnership>();
  children.isOwnedBy.mockResolvedValue(Result.ok(true));
  outbox = mockPort<IOutboxRepository>();
  uow = mockUnitOfWork();
  stored = new Map();

  repo.insertIfAbsent.mockImplementation(async (event) => {
    if (stored.has(keyOf(event))) return Result.ok(false);

    stored.set(keyOf(event), event);
    return Result.ok(true);
  });
  planner.planDefault.mockResolvedValue(Result.ok());

  service = new EventIngestService(
    repo,
    children,
    planner,
    uow.unitOfWork,
    outbox,
    mockInstrumentation(),
  );
});

const ingest = (events: IngestedEvent[]) =>
  service.ingest({ userId: PARENT, childId: CHILD, announcement, events });

describe("ingest", () => {
  it("given two events of one announcement ingested twice, then two rows exist and the second ingest creates none", async () => {
    const events = [extracted(), extracted({ title: "Sortie au musée", category: "school_trip" })];

    const first = await ingest(events);
    const second = await ingest(events);

    expect(first.getValue()).toEqual({ created: 2, skipped: 0 });
    expect(second.getValue()).toEqual({ created: 0, skipped: 2 });
    expect(stored.size).toBe(2);
    expect(planner.planDefault).toHaveBeenCalledTimes(2);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.EVENT_CREATED,
      EventTypes.EVENT_CREATED,
    ]);
  });

  it("given an ordinal whose row already exists, edited or deleted, then the row is left untouched", async () => {
    repo.insertIfAbsent.mockResolvedValue(Result.ok(false));

    const result = await ingest([extracted({ title: "Autre titre du professeur" })]);

    expect(result.getValue()).toEqual({ created: 0, skipped: 1 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(planner.planDefault).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an event that needs review, then it is stored for review, announced as such and no alert is planned", async () => {
    const result = await ingest([extracted({ needsReview: true })]);

    const row = [...stored.values()][0];
    expect(result.getValue()).toEqual({ created: 1, skipped: 0 });
    expect(row?.get("status").value).toBe("needs_review");
    expect(planner.planDefault).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_CREATED,
        aggregateId: row?.id.value ?? "",
        payload: {
          userId: PARENT,
          childId: CHILD,
          eventId: row?.id.value,
          needsReview: true,
          actorUserId: null,
        },
      },
    ]);
  });

  it("given a confident event, then its default alert is planned once with its deadline", async () => {
    await ingest([extracted({ deadlineTime: "08:30" })]);

    const row = [...stored.values()][0];
    expect(row?.get("status").value).toBe("confirmed");
    expect(row?.get("receivedAt")).toEqual(announcement.publishedAt);
    expect(planner.planDefault).toHaveBeenCalledTimes(1);
    expect(planner.planDefault).toHaveBeenCalledWith({
      eventId: row?.id.value,
      userId: PARENT,
      deadlineDate: "2026-11-19",
      deadlineTime: "08:30",
    });
  });

  it("given a date that does not exist, then nothing is stored and EVENT_INVALID_DEADLINE is returned", async () => {
    const result = await ingest([extracted(), extracted({ deadlineDate: "2026-02-30" })]);

    expect(result.getError().code).toBe("EVENT_INVALID_DEADLINE");
    expect(stored.size).toBe(0);
  });

  it("given an unknown category, then EVENT_INVALID_CATEGORY is returned", async () => {
    const result = await ingest([extracted({ category: "party" })]);

    expect(result.getError().code).toBe("EVENT_INVALID_CATEGORY");
  });

  it("given the alert planner fails, then the whole ingest rolls back and reports it", async () => {
    planner.planDefault.mockResolvedValue(
      Result.fail({ code: "ALERT_PROVIDER_FAILURE", message: "down" }),
    );

    const result = await ingest([extracted()]);

    expect(result.getError().code).toBe("ALERT_PROVIDER_FAILURE");
    expect(uow.outcome()).toBe("rolled_back");
  });

  it("given a child that is not the parent's, then EVENT_CHILD_NOT_FOUND and nothing is written", async () => {
    children.isOwnedBy.mockResolvedValue(Result.ok(false));

    const result = await ingest([extracted()]);

    expect(children.isOwnedBy).toHaveBeenCalledWith(PARENT, CHILD);
    expect(result.getError().code).toBe("EVENT_CHILD_NOT_FOUND");
    expect(repo.insertIfAbsent).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
