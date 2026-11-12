import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
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
import { EventDeadline } from "../domain/value-objects/event-deadline.vo";
import { EventDescription } from "../domain/value-objects/event-description.vo";
import { EventTitle } from "../domain/value-objects/event-title.vo";
import { CHILD, PARENT } from "../testing/agenda-event.fixture";

const updatedPayload = z.object({ fields: z.array(z.string()) });

const NOW = new Date("2026-11-10T09:00:00.000Z");

const deadlineOf = (date: string) => EventDeadline.fromParisWallTime(date).getValue();

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
  repo.lockCourseworkItems.mockImplementation(async (_userId, childId, courseworkIds) =>
    Result.ok(
      courseworkIds.flatMap((id) => {
        const found = stored.get(`${childId}|coursework|${id}|0`);
        return found ? [found] : [];
      }),
    ),
  );
  repo.save.mockResolvedValue(Result.ok());
  repo.lockLiveCoursework.mockImplementation(async (_userId, childId, courses) =>
    Result.ok(
      [...stored.values()].filter(
        (event) =>
          event.get("childId") === childId &&
          ("courseId" in courses
            ? event.get("courseId") === courses.courseId
            : !courses.outsideCourseIds.includes(event.get("courseId")) &&
              event.get("deadline").value.at >= courses.dueFrom) &&
          event.get("source").value === "coursework" &&
          event.get("deletedAt").isNone() &&
          event.get("withdrawnAt").isNone(),
      ),
    ),
  );
  repo.listAnnouncementsOn.mockImplementation(async (_userId, day) =>
    Result.ok(
      [...stored.values()].filter(
        (event) =>
          event.get("source").value === "announcement" &&
          event.get("childId") === day.childId &&
          event.get("courseId") === day.courseId &&
          event.get("deadline").value.date === day.deadlineDate &&
          event.get("deletedAt").isNone() &&
          event.get("withdrawnAt").isNone(),
      ),
    ),
  );
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
    () => NOW,
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
      actorUserId: null,
    });
  });

  it("given a date that does not exist, then nothing is stored and EVENT_DEADLINE_INVALID is returned", async () => {
    const result = await ingest([extracted(), extracted({ deadlineDate: "2026-02-30" })]);

    expect(result.getError().code).toBe("EVENT_DEADLINE_INVALID");
    expect(stored.size).toBe(0);
  });

  it("given an extracted time skipped by the spring change, then the first valid time is stored and alerted", async () => {
    await ingest([extracted({ deadlineDate: "2027-03-28", deadlineTime: "02:30" })]);

    const row = [...stored.values()][0];
    expect(row?.get("deadline").value).toEqual({
      date: "2027-03-28",
      time: "03:30",
      at: new Date("2027-03-28T01:30:00.000Z"),
    });
    expect(planner.planDefault).toHaveBeenCalledTimes(1);
  });

  it("given an unknown category, then EVENT_CATEGORY_INVALID is returned", async () => {
    const result = await ingest([extracted({ category: "party" })]);

    expect(result.getError().code).toBe("EVENT_CATEGORY_INVALID");
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

const ingestCoursework = (
  items: IngestedCoursework[],
  listing: { complete: boolean; presentIds?: string[] } = { complete: true },
) =>
  service.ingestCoursework({
    userId: PARENT,
    childId: CHILD,
    courseId: "course-1",
    items,
    complete: listing.complete,
    presentIds: listing.presentIds ?? items.map(({ id }) => id),
  });

const courseworkRow = (id = "w1") => stored.get(`${CHILD}|coursework|${id}|0`);

const updatedFields = () =>
  enqueuedEvents(outbox)
    .filter(({ eventType }) => eventType === EventTypes.EVENT_UPDATED)
    .map(({ payload }) => updatedPayload.parse(payload).fields);

describe("ingestCoursework", () => {
  it("given a new dated coursework, then a confirmed homework is stored from the coursework and alerted", async () => {
    const result = await ingestCoursework([homework()]);

    const row = courseworkRow();
    expect(result.getValue()).toEqual({ created: 1, updated: 0, rejected: 0, withdrawn: 0 });
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

  it("given a coursework due at a time skipped by the spring change, then the first valid time is stored", async () => {
    await ingestCoursework([homework({ deadlineDate: "2027-03-28", deadlineTime: "02:30" })]);

    expect(courseworkRow()?.get("deadline").value).toEqual({
      date: "2027-03-28",
      time: "03:30",
      at: new Date("2027-03-28T01:30:00.000Z"),
    });
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

    expect(result.getValue()).toEqual({ created: 0, updated: 1, rejected: 0, withdrawn: 0 });
    expect(courseworkRow()?.get("title").value).toBe("Exercices p. 44");
    expect(courseworkRow()?.get("deadline").value.date).toBe("2026-11-23");
    expect(planner.replan).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: courseworkRow()?.id.value }),
    );
    expect(updatedFields()).toEqual([["title", "deadline"]]);
  });

  it("given the sync follows a coursework, then EVENT_UPDATED names no parent as its actor", async () => {
    await ingestCoursework([homework()]);

    await ingestCoursework([homework({ done: true })]);

    const updated = enqueuedEvents(outbox).filter(
      ({ eventType }) => eventType === EventTypes.EVENT_UPDATED,
    );
    expect(updated.map(({ payload }) => payload)).toEqual([
      {
        userId: PARENT,
        eventId: courseworkRow()?.id.value,
        fields: ["done"],
        actorUserId: null,
      },
    ]);
  });

  it("given several coursework of a course, then their stored rows are locked in one read", async () => {
    await ingestCoursework([homework({ id: "w1" }), homework({ id: "w2" })]);
    repo.lockCourseworkItems.mockClear();

    await ingestCoursework([
      homework({ id: "w1" }),
      homework({ id: "w2" }),
      homework({ id: "w3" }),
    ]);

    expect(repo.lockCourseworkItems.mock.calls).toEqual([[PARENT, CHILD, ["w1", "w2", "w3"]]]);
  });

  it("given the parent changed the date, then the teacher's date is ignored but the title and done still follow", async () => {
    await ingestCoursework([homework()]);
    const row = courseworkRow();
    row?.edit({ deadline: deadlineOf("2026-11-21") }, new Date());

    await ingestCoursework([
      homework({ title: "Exercices p. 44", deadlineDate: "2026-11-23", done: true }),
    ]);

    expect(row?.get("deadline").value.date).toBe("2026-11-21");
    expect(row?.get("title").value).toBe("Exercices p. 44");
    expect(row?.get("done")).toBe(true);
    expect(planner.replan).not.toHaveBeenCalled();
    expect(planner.cancel).toHaveBeenCalledWith(row?.id.value, null);
    expect(updatedFields()).toEqual([["title", "done"]]);
  });

  it("given the parent marked a turned-in coursework to do, then the next sync keeps it to do but still follows the date", async () => {
    await ingestCoursework([homework({ done: true })]);
    const row = courseworkRow();
    row?.markDone(false);

    await ingestCoursework([homework({ deadlineDate: "2026-11-23", done: true })]);

    expect(row?.get("done")).toBe(false);
    expect(row?.get("deadline").value.date).toBe("2026-11-23");
    expect(planner.cancel).not.toHaveBeenCalled();
    expect(updatedFields()).toEqual([["deadline"]]);
  });

  it("given the parent marked a coursework done, then a sync that still sees it pending leaves it done", async () => {
    await ingestCoursework([homework()]);
    courseworkRow()?.markDone(true);

    const result = await ingestCoursework([homework()]);

    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0, withdrawn: 0 });
    expect(courseworkRow()?.get("done")).toBe(true);
  });

  it("given the parent changed the title, then the teacher's title is ignored but the date still follows", async () => {
    await ingestCoursework([homework()]);
    const row = courseworkRow();
    row?.edit({ title: EventTitleOf("Exercices à rendre lundi") }, new Date());

    await ingestCoursework([homework({ title: "Exercices p. 44", deadlineDate: "2026-11-23" })]);

    expect(row?.get("title").value).toBe("Exercices à rendre lundi");
    expect(row?.get("deadline").value.date).toBe("2026-11-23");
    expect(updatedFields()).toEqual([["deadline"]]);
  });

  it("given the parent only added a note, then the date and the title still follow the teacher", async () => {
    await ingestCoursework([homework()]);
    const row = courseworkRow();
    row?.edit({ description: EventDescription.create("Avec la fiche").getValue() }, new Date());

    await ingestCoursework([homework({ title: "Exercices p. 44", deadlineDate: "2026-11-23" })]);

    expect(row?.get("title").value).toBe("Exercices p. 44");
    expect(row?.get("deadline").value.date).toBe("2026-11-23");
    expect(row?.get("description").value).toBe("Avec la fiche");
  });

  it("given the parent deleted the event, then the coursework does not bring it back", async () => {
    await ingestCoursework([homework()]);
    courseworkRow()?.delete(new Date());

    const result = await ingestCoursework([homework({ deadlineDate: "2026-11-23" })]);

    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0, withdrawn: 0 });
    expect(repo.save).not.toHaveBeenCalled();
    expect(updatedFields()).toEqual([]);
  });

  it("given an unchanged coursework, then nothing is written", async () => {
    await ingestCoursework([homework()]);

    const result = await ingestCoursework([homework()]);

    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0, withdrawn: 0 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given one invalid coursework among valid ones, then only that one is rejected", async () => {
    const result = await ingestCoursework([
      homework({ id: "w1", title: "   " }),
      homework({ id: "w2", deadlineDate: "2026-02-30" }),
      homework({ id: "w3" }),
    ]);

    expect(result.getValue()).toEqual({ created: 1, updated: 0, rejected: 2, withdrawn: 0 });
    expect(courseworkRow("w3")).toBeDefined();
    expect(uow.outcome()).toBe("committed");
  });

  it("given a child that is not the parent's, then EVENT_CHILD_NOT_FOUND and nothing is written", async () => {
    children.isOwnedBy.mockResolvedValue(Result.ok(false));

    const result = await ingestCoursework([homework()]);

    expect(result.getError().code).toBe("EVENT_CHILD_NOT_FOUND");
    expect(repo.insertIfAbsent).not.toHaveBeenCalled();
  });

  it("given a complete listing without a stored coursework, then it is withdrawn, not deleted, and its alert cancelled", async () => {
    await ingestCoursework([homework({ id: "w1" }), homework({ id: "w2" })]);

    const result = await ingestCoursework([homework({ id: "w2" })]);

    const w1 = courseworkRow("w1");
    expect(result.getValue()).toEqual({ created: 0, updated: 0, rejected: 0, withdrawn: 1 });
    expect(w1?.get("withdrawnAt").isSome()).toBe(true);
    expect(w1?.get("deletedAt").isNone()).toBe(true);
    expect(courseworkRow("w2")?.get("withdrawnAt").isNone()).toBe(true);
    expect(planner.cancel).toHaveBeenCalledWith(w1?.id.value, null);
    expect(updatedFields()).toEqual([["withdrawn"]]);
  });

  it("given a withdrawn coursework listed and dated again, then it comes back with its alert", async () => {
    await ingestCoursework([homework({ id: "w1" })]);
    await ingestCoursework([]);
    planner.planDefault.mockClear();

    const result = await ingestCoursework([homework({ id: "w1", deadlineDate: "2026-11-23" })]);

    const w1 = courseworkRow("w1");
    expect(result.getValue()).toEqual({ created: 0, updated: 1, rejected: 0, withdrawn: 0 });
    expect(w1?.get("withdrawnAt").isNone()).toBe(true);
    expect(w1?.get("deadline").value.date).toBe("2026-11-23");
    expect(planner.planDefault).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: w1?.id.value }),
    );
  });

  it("given a withdrawn coursework that comes back already turned in, then it returns without an alert", async () => {
    await ingestCoursework([homework({ id: "w1" })]);
    await ingestCoursework([]);
    planner.planDefault.mockClear();

    await ingestCoursework([homework({ id: "w1", done: true })]);

    expect(courseworkRow("w1")?.get("withdrawnAt").isNone()).toBe(true);
    expect(planner.planDefault).not.toHaveBeenCalled();
  });

  it("given a partial listing, then nothing is withdrawn", async () => {
    await ingestCoursework([homework({ id: "w1" })]);

    const result = await ingestCoursework([], { complete: false, presentIds: [] });

    expect(result.getValue().withdrawn).toBe(0);
    expect(courseworkRow("w1")?.get("withdrawnAt").isNone()).toBe(true);
    expect(planner.cancel).not.toHaveBeenCalled();
  });
});

describe("an announcement hidden by a coursework of its day", () => {
  const hiddenAnnouncement = async () => {
    await ingest([extracted({ deadlineDate: "2026-11-19" })]);
    await ingestCoursework([homework({ id: "w1", deadlineDate: "2026-11-19" })]);
    planner.planDefault.mockClear();
    return [...stored.values()].find((event) => event.get("source").value === "announcement");
  };

  it("given the teacher withdraws the coursework, then the announcement's alert is planned by the system and the coursework's is cancelled", async () => {
    const shown = await hiddenAnnouncement();

    await ingestCoursework([]);

    expect(planner.cancel).toHaveBeenCalledWith(courseworkRow("w1")?.id.value, null);
    expect(planner.planDefault).toHaveBeenCalledWith({
      eventId: shown?.id.value,
      userId: PARENT,
      actorUserId: null,
    });
  });

  it("given the teacher moves the coursework to another day, then the announcement of the day it left gets its alert", async () => {
    const shown = await hiddenAnnouncement();

    await ingestCoursework([homework({ id: "w1", deadlineDate: "2026-11-23" })]);

    expect(planner.planDefault).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: shown?.id.value, actorUserId: null }),
    );
  });

  it("given the teacher only renames the coursework, then no announcement is replanned", async () => {
    await hiddenAnnouncement();

    await ingestCoursework([homework({ id: "w1", title: "Exercices p. 50" })]);

    expect(planner.planDefault).not.toHaveBeenCalled();
  });
});

describe("withdrawCourseworkOutside", () => {
  it("given the child's active courses, then the coursework of the other courses is withdrawn", async () => {
    await ingestCoursework([homework({ id: "w1" })]);
    await service.ingestCoursework({
      userId: PARENT,
      childId: CHILD,
      courseId: "course-2",
      items: [homework({ id: "w2" })],
      complete: true,
      presentIds: ["w2"],
    });

    const result = await service.withdrawCourseworkOutside({
      userId: PARENT,
      childId: CHILD,
      activeCourseIds: ["course-1"],
    });

    expect(result.getValue()).toEqual({ withdrawn: 1 });
    expect(courseworkRow("w1")?.get("withdrawnAt").isNone()).toBe(true);
    expect(courseworkRow("w2")?.get("withdrawnAt").isSome()).toBe(true);
    expect(planner.cancel).toHaveBeenCalledWith(courseworkRow("w2")?.id.value, null);
  });

  it("given a course archived at the end of the term, then its past coursework stays in the history", async () => {
    await ingestCoursework([
      homework({ id: "past", deadlineDate: "2026-11-02" }),
      homework({ id: "next", deadlineDate: "2026-11-19" }),
    ]);

    const result = await service.withdrawCourseworkOutside({
      userId: PARENT,
      childId: CHILD,
      activeCourseIds: [],
    });

    expect(result.getValue()).toEqual({ withdrawn: 1 });
    expect(courseworkRow("past")?.get("withdrawnAt").isNone()).toBe(true);
    expect(courseworkRow("next")?.get("withdrawnAt").isSome()).toBe(true);
  });

  it("given a child that is not the parent's, then EVENT_CHILD_NOT_FOUND and nothing is withdrawn", async () => {
    children.isOwnedBy.mockResolvedValue(Result.ok(false));

    const result = await service.withdrawCourseworkOutside({
      userId: PARENT,
      childId: CHILD,
      activeCourseIds: [],
    });

    expect(result.getError().code).toBe("EVENT_CHILD_NOT_FOUND");
    expect(repo.lockLiveCoursework).not.toHaveBeenCalled();
  });
});
