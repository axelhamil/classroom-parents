import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import { z } from "zod";
import type { IAlertPlanner } from "../application/ports/alert-planner.port";
import type { IChildOwnership } from "../application/ports/child-ownership.port";
import type { IEventRepository } from "../application/ports/event-repository.port";
import {
  EventIngestService,
  type IngestedCoursework,
  type IngestedEvent,
} from "../application/services/event-ingest.service";
import type { AgendaEvent } from "../domain/event.aggregate";
import { EventTitle } from "../domain/value-objects/event-title.vo";
import { CHILD, PARENT } from "../testing/agenda-event.fixture";

const updatedPayload = z.object({ fields: z.array(z.string()) });

const EventTitleOf = (title: string) => EventTitle.create(title).getValue();

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
  `${event.get("childId")}|${event.get("source").value}|${event.get("announcementId")}|${event.get("ordinal")}`;

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
  repo.lockCoursework.mockImplementation(async (_userId, childId, courseworkId) =>
    Result.ok(Option.fromNullable(stored.get(`${childId}|coursework|${courseworkId}|0`))),
  );
  repo.save.mockResolvedValue(Result.ok());
  planner.planDefault.mockResolvedValue(Result.ok());
  planner.replan.mockResolvedValue(Result.ok());
  planner.cancel.mockResolvedValue(Result.ok());

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

function homework(overrides: Partial<IngestedCoursework> = {}): IngestedCoursework {
  return {
    id: "w1",
    title: "Exercices p. 42",
    url: "https://classroom.google.com/c/course-1/a/w1",
    deadlineDate: "2026-11-19",
    deadlineTime: "08:00",
    done: false,
    ...overrides,
  };
}

const ingestCoursework = (items: IngestedCoursework[]) =>
  service.ingestCoursework({ userId: PARENT, childId: CHILD, courseId: "course-1", items });

const courseworkRow = (id = "w1") => stored.get(`${CHILD}|coursework|${id}|0`);

const updatedFields = () =>
  enqueuedEvents(outbox)
    .filter(({ eventType }) => eventType === EventTypes.EVENT_UPDATED)
    .map(({ payload }) => updatedPayload.parse(payload).fields);

describe("ingestCoursework", () => {
  it("given a new dated coursework, then a confirmed homework is stored from the coursework and alerted", async () => {
    const result = await ingestCoursework([homework()]);

    const row = courseworkRow();
    expect(result.getValue()).toEqual({ created: 1, updated: 0, rejected: 0 });
    expect(row?.get("source").value).toBe("coursework");
    expect(row?.get("category").value).toBe("homework");
    expect(row?.get("status").value).toBe("confirmed");
    expect(row?.get("courseId")).toBe("course-1");
    expect(row?.get("deadline").value.time).toBe("08:00");
    expect(planner.planDefault).toHaveBeenCalledTimes(1);
    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.EVENT_CREATED,
    ]);
  });

  it("given a coursework already turned in, then it is stored as done and no alert is planned", async () => {
    await ingestCoursework([homework({ done: true })]);

    expect(courseworkRow()?.get("done")).toBe(true);
    expect(planner.planDefault).not.toHaveBeenCalled();
  });

  it("given the teacher moves and renames a coursework, then the event follows and its alert is replanned", async () => {
    await ingestCoursework([homework()]);

    const result = await ingestCoursework([
      homework({ title: "Exercices p. 44", deadlineDate: "2026-11-23" }),
    ]);

    expect(result.getValue()).toEqual({ created: 0, updated: 1, rejected: 0 });
    expect(courseworkRow()?.get("title").value).toBe("Exercices p. 44");
    expect(courseworkRow()?.get("deadline").value.date).toBe("2026-11-23");
    expect(planner.replan).toHaveBeenCalledWith(
      expect.objectContaining({ deadlineDate: "2026-11-23" }),
    );
    expect(updatedFields()).toEqual([["title", "deadline"]]);
  });

  it("given the parent edited the event, then the teacher's date and title are ignored but done still follows", async () => {
    await ingestCoursework([homework()]);
    const row = courseworkRow();
    row?.edit({ title: EventTitleOf("Exercices à rendre lundi") }, new Date());

    await ingestCoursework([homework({ deadlineDate: "2026-11-23", done: true })]);

    expect(row?.get("title").value).toBe("Exercices à rendre lundi");
    expect(row?.get("deadline").value.date).toBe("2026-11-19");
    expect(row?.get("done")).toBe(true);
    expect(planner.replan).not.toHaveBeenCalled();
    expect(planner.cancel).toHaveBeenCalledWith(row?.id.value);
    expect(updatedFields()).toEqual([["done"]]);
  });

  it("given the parent deleted the event, then the coursework does not bring it back", async () => {
    await ingestCoursework([homework()]);
    courseworkRow()?.delete(new Date());

    const result = await ingestCoursework([homework({ deadlineDate: "2026-11-23" })]);

    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(updatedFields()).toEqual([]);
  });

  it("given an unchanged coursework, then nothing is written", async () => {
    await ingestCoursework([homework()]);

    const result = await ingestCoursework([homework()]);

    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given one invalid coursework among valid ones, then only that one is rejected", async () => {
    const result = await ingestCoursework([
      homework({ id: "w1", title: "   " }),
      homework({ id: "w2", deadlineDate: "2026-02-30" }),
      homework({ id: "w3" }),
    ]);

    expect(result.getValue()).toEqual({ created: 1, updated: 0, rejected: 2 });
    expect(courseworkRow("w3")).toBeDefined();
    expect(uow.outcome()).toBe("committed");
  });

  it("given a child that is not the parent's, then EVENT_CHILD_NOT_FOUND and nothing is written", async () => {
    children.isOwnedBy.mockResolvedValue(Result.ok(false));

    const result = await ingestCoursework([homework()]);

    expect(result.getError().code).toBe("EVENT_CHILD_NOT_FOUND");
    expect(repo.insertIfAbsent).not.toHaveBeenCalled();
  });
});
