import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork, type UnitOfWorkMock } from "@packages/test/bun/unit-of-work";
import type { EventPatch } from "../application/dto/event.dto";
import type { IAlertPlanner } from "../application/ports/alert-planner.port";
import type { AgendaError, IEventRepository } from "../application/ports/event-repository.port";
import type { IVisibleChildren } from "../application/ports/visible-children.port";
import { EventEditService } from "../application/services/event-edit.service";
import type { AgendaEvent } from "../domain/event.aggregate";
import {
  type AgendaEventOverrides,
  agendaEvent,
  CHILD,
  PARENT,
} from "../testing/agenda-event.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");

let repo: PortMock<IEventRepository>;
let planner: PortMock<IAlertPlanner>;
let outbox: PortMock<IOutboxRepository>;
let children: PortMock<IVisibleChildren>;
let uow: UnitOfWorkMock;
let service: EventEditService;
let event: AgendaEvent;

function given(overrides: AgendaEventOverrides = {}): AgendaEvent {
  event = agendaEvent(overrides);
  repo.lockOwned.mockResolvedValue(Result.ok<Option<AgendaEvent>, AgendaError>(Option.some(event)));
  return event;
}

beforeEach(() => {
  repo = mockPort<IEventRepository>();
  planner = mockPort<IAlertPlanner>();
  outbox = mockPort<IOutboxRepository>();
  children = mockPort<IVisibleChildren>();
  children.idsOf.mockResolvedValue(Result.ok([CHILD]));
  uow = mockUnitOfWork();

  repo.save.mockResolvedValue(Result.ok());
  repo.listAnnouncementsOn.mockResolvedValue(Result.ok([]));
  planner.planDefault.mockResolvedValue(Result.ok());
  planner.replan.mockResolvedValue(Result.ok());
  planner.cancel.mockResolvedValue(Result.ok());
  given();

  service = new EventEditService(
    repo,
    children,
    planner,
    uow.unitOfWork,
    outbox,
    mockInstrumentation(),
    () => NOW,
  );
});

describe("edit", () => {
  it("given a deadline moved from 19 to 26 November, then the alert is replanned and EVENT_UPDATED names the deadline", async () => {
    const result = await service.edit(PARENT, event.id.value, { deadlineDate: "2026-11-26" });

    expect(result.getValue()).toMatchObject({
      deadlineDate: "2026-11-26",
      deadlineAt: "2026-11-26T22:59:00.000Z",
      editedFields: ["deadline"],
    });
    expect(repo.save.mock.calls[0]?.[0].get("editedAt")).toEqual(Option.some(NOW));
    expect(planner.replan).toHaveBeenCalledWith({
      eventId: event.id.value,
      userId: PARENT,
      actorUserId: PARENT,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_UPDATED,
        aggregateId: event.id.value,
        payload: {
          userId: PARENT,
          eventId: event.id.value,
          fields: ["deadline"],
          actorUserId: PARENT,
        },
      },
    ]);
  });

  it("given a time cleared, then the deadline falls back to 23:59 Paris", async () => {
    given({ deadlineTime: "08:30" });

    const result = await service.edit(PARENT, event.id.value, { deadlineTime: "clear" });

    expect(result.getValue().deadlineTime).toBeUndefined();
    expect(result.getValue().deadlineAt).toBe("2026-11-19T22:59:00.000Z");
  });

  it("given an event still to review whose deadline moves, then its reminders are replanned", async () => {
    given({ status: "needs_review" });

    await service.edit(PARENT, event.id.value, { deadlineDate: "2026-11-26" });

    expect(planner.replan).toHaveBeenCalledTimes(1);
  });

  it("given the parent-only category other, then a Classroom event is recategorized", async () => {
    const result = await service.edit(PARENT, event.id.value, { category: "other" });

    expect(result.getValue()).toMatchObject({ category: "other", editedFields: ["category"] });
  });

  it("given a new title only, then no alert is touched and EVENT_UPDATED names the title", async () => {
    await service.edit(PARENT, event.id.value, { title: "Contrôle de physique" });

    expect(planner.replan).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ fields: ["title"] });
  });

  const refusals: [string, EventPatch, AgendaError["code"]][] = [
    ["an empty title", { title: "   " }, "EVENT_TITLE_INVALID"],
    ["a 121-character title", { title: "a".repeat(121) }, "EVENT_TITLE_INVALID"],
    [
      "a 2001-character description",
      { description: "a".repeat(2001) },
      "EVENT_DESCRIPTION_INVALID",
    ],
    ["an unknown category", { category: "party" }, "EVENT_CATEGORY_INVALID"],
    ["a date that does not exist", { deadlineDate: "2026-11-31" }, "EVENT_DEADLINE_INVALID"],
    [
      "a time skipped by the spring change",
      { deadlineDate: "2027-03-28", deadlineTime: "02:30" },
      "EVENT_DEADLINE_INVALID",
    ],
  ];

  it.each(refusals)(
    "given %s, then it is refused and nothing is saved",
    async (_label, patch, code) => {
      const result = await service.edit(PARENT, event.id.value, patch);

      expect(result.getError().code).toBe(code);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it("given an event the parent does not own, then EVENT_NOT_FOUND", async () => {
    repo.lockOwned.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.edit(PARENT, event.id.value, { title: "Pirate" });

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
  });
});

describe("add", () => {
  const body = {
    childId: CHILD,
    title: "Rendez-vous orthodontiste",
    category: "document_due",
    deadlineDate: "2026-11-24",
    deadlineTime: "17:30",
  };

  beforeEach(() => {
    repo.insertIfAbsent.mockResolvedValue(Result.ok(true));
  });

  it("given a child of the parent, then a confirmed manual event without Classroom link is stored, its default reminders planned and EVENT_ADDED names the parent", async () => {
    const result = await service.add(PARENT, body);

    const stored = repo.insertIfAbsent.mock.calls[0]?.[0];
    if (!stored) throw new Error("manual event not stored");
    expect(stored.get("source").value).toBe("manual");
    expect(stored.get("courseId").isNone()).toBe(true);
    expect(result.getValue()).toMatchObject({
      childId: CHILD,
      title: "Rendez-vous orthodontiste",
      description: "",
      category: "document_due",
      deadlineDate: "2026-11-24",
      deadlineTime: "17:30",
      deadlineAt: "2026-11-24T16:30:00.000Z",
      status: "confirmed",
      source: "manual",
      done: false,
      announcementUrl: undefined,
      receivedAt: NOW.toISOString(),
      edited: false,
    });
    expect(planner.planDefault).toHaveBeenCalledWith({
      eventId: stored.id.value,
      userId: PARENT,
      actorUserId: PARENT,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_ADDED,
        aggregateId: stored.id.value,
        payload: { userId: PARENT, childId: CHILD, eventId: stored.id.value, actorUserId: PARENT },
      },
    ]);
  });

  it("given the parent-only category other, then the manual event is stored with it", async () => {
    const result = await service.add(PARENT, { ...body, category: "other" });

    expect(result.getValue().category).toBe("other");
  });

  it("given no time, then the deadline falls at 23:59 Paris", async () => {
    const result = await service.add(PARENT, { ...body, deadlineTime: undefined });

    expect(result.getValue().deadlineAt).toBe("2026-11-24T22:59:00.000Z");
  });

  it("given a child that is not visible to the parent, then EVENT_CHILD_NOT_FOUND and nothing is stored", async () => {
    children.idsOf.mockResolvedValue(Result.ok([]));

    const result = await service.add(PARENT, body);

    expect(result.getError().code).toBe("EVENT_CHILD_NOT_FOUND");
    expect(repo.insertIfAbsent).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it.each([
    ["an empty title", { title: " " }, "EVENT_TITLE_INVALID"],
    ["an unknown category", { category: "party" }, "EVENT_CATEGORY_INVALID"],
    ["a date that does not exist", { deadlineDate: "2026-11-31" }, "EVENT_DEADLINE_INVALID"],
  ] as const)("given %s, then it is refused and nothing is stored", async (_label, patch, code) => {
    const result = await service.add(PARENT, { ...body, ...patch });

    expect(result.getError().code).toBe(code);
    expect(repo.insertIfAbsent).not.toHaveBeenCalled();
  });

  it("given a manual event whose deadline moves, then its reminders are replanned and no announcement is read", async () => {
    await service.add(PARENT, body);
    const manual = repo.insertIfAbsent.mock.calls[0]?.[0];
    if (!manual) throw new Error("manual event not stored");
    repo.lockOwned.mockResolvedValue(Result.ok(Option.some(manual)));

    const result = await service.edit(PARENT, manual.id.value, { deadlineDate: "2026-11-25" });

    expect(result.getValue().deadlineDate).toBe("2026-11-25");
    expect(planner.replan).toHaveBeenCalledTimes(1);
    expect(repo.listAnnouncementsOn).not.toHaveBeenCalled();
  });
});

describe("confirm", () => {
  it("given an event to review, then it is confirmed and its default alert planned", async () => {
    given({ status: "needs_review", deadlineTime: "08:30" });

    const result = await service.confirm(PARENT, event.id.value);

    expect(result.getValue().status).toBe("confirmed");
    expect(planner.planDefault).toHaveBeenCalledWith({
      eventId: event.id.value,
      userId: PARENT,
      actorUserId: PARENT,
    });
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ fields: ["status"] });
  });

  it("given an event already confirmed, then no second alert is planned", async () => {
    const result = await service.confirm(PARENT, event.id.value);

    expect(result.isSuccess).toBe(true);
    expect(planner.planDefault).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("markDone", () => {
  it("given an event to do, when the parent marks it done, then it is saved done, its reminders are replanned and EVENT_UPDATED names the parent", async () => {
    const result = await service.markDone(PARENT, event.id.value, true);

    expect(result.getValue()).toMatchObject({ done: true, edited: false, editedFields: ["done"] });
    expect(repo.save.mock.calls[0]?.[0].get("done")).toBe(true);
    expect(planner.replan).toHaveBeenCalledWith({
      eventId: event.id.value,
      userId: PARENT,
      actorUserId: PARENT,
    });
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_UPDATED,
        aggregateId: event.id.value,
        payload: { userId: PARENT, eventId: event.id.value, fields: ["done"], actorUserId: PARENT },
      },
    ]);
  });

  it("given a done event, when the parent marks it to do, then its reminders are replanned", async () => {
    event.markDone(true);

    const result = await service.markDone(PARENT, event.id.value, false);

    expect(result.getValue().done).toBe(false);
    expect(planner.replan).toHaveBeenCalledTimes(1);
  });

  it("given an event already done, when the parent marks it done again, then nothing is written", async () => {
    event.markDone(true);

    const result = await service.markDone(PARENT, event.id.value, true);

    expect(result.getValue().done).toBe(true);
    expect(repo.save).not.toHaveBeenCalled();
    expect(planner.replan).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an event the parent does not own, then EVENT_NOT_FOUND and nothing is written", async () => {
    repo.lockOwned.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.markDone(PARENT, event.id.value, true);

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe("changeChecklist", () => {
  const SWIMSUIT = "prepare.items.swimming.swimsuit";
  const TOWEL = "prepare.items.swimming.towel";
  const EXTRA = "5b0e7f3c-2d4a-4c1e-9f8b-1a2b3c4d5e6f";

  function checklistUpdated() {
    return [
      {
        eventType: EventTypes.EVENT_UPDATED,
        aggregateId: event.id.value,
        payload: {
          userId: PARENT,
          eventId: event.id.value,
          fields: ["checklist"],
          actorUserId: PARENT,
        },
      },
    ];
  }

  it("given an item to prepare, when the parent ticks it, then the event keeps it done for every device and EVENT_UPDATED names the parent", async () => {
    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: true,
    });

    expect(result.getValue().checklist).toEqual({ done: [SWIMSUIT], removed: [], extra: [] });
    expect(repo.save.mock.calls[0]?.[0].get("checklist").value.done).toEqual([SWIMSUIT]);
    expect(planner.replan).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual(checklistUpdated());
  });

  it("given a ticked item, when the parent unticks it, then it is to prepare again", async () => {
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: true,
    });

    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: false,
    });

    expect(result.getValue().checklist.done).toEqual([]);
  });

  it("given an item already ticked, when it is ticked again, then nothing is written", async () => {
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: true,
    });
    repo.save.mockClear();
    outbox.enqueue.mockClear();

    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: true,
    });

    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an item of the parent's own, when it is added then removed, then it leaves no tick behind", async () => {
    const added = await service.changeChecklist(PARENT, event.id.value, {
      kind: "add",
      id: EXTRA,
      label: "Bonnet de bain",
    });
    expect(added.getValue().checklist.extra).toEqual([{ id: EXTRA, label: "Bonnet de bain" }]);
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: EXTRA,
      done: true,
    });

    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "remove",
      itemId: EXTRA,
    });

    expect(result.getValue().checklist).toEqual({ done: [], removed: [], extra: [] });
  });

  it("given 60 items of the parent's own added then removed, then the next one can still be removed", async () => {
    for (let cycle = 0; cycle < 60; cycle++) {
      const id = `${EXTRA}-${cycle}`;
      await service.changeChecklist(PARENT, event.id.value, { kind: "add", id, label: "Gourde" });
      const removed = await service.changeChecklist(PARENT, event.id.value, {
        kind: "remove",
        itemId: id,
      });

      expect(removed.isSuccess).toBe(true);
    }
  });

  it("given a label longer than 80 characters, then EVENT_CHECKLIST_INVALID and nothing is written", async () => {
    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "add",
      id: EXTRA,
      label: "x".repeat(81),
    });

    expect(result.getError().code).toBe("EVENT_CHECKLIST_INVALID");
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given a checklist no device has changed yet, when a local one is imported, then the event adopts it", async () => {
    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "import",
      checklist: {
        done: [SWIMSUIT, EXTRA],
        removed: ["prepare.items.swimming.cap"],
        extra: [{ id: EXTRA, label: "Bonnet de bain" }],
      },
    });

    expect(result.getValue().checklist).toEqual({
      done: [SWIMSUIT, EXTRA],
      removed: ["prepare.items.swimming.cap"],
      extra: [{ id: EXTRA, label: "Bonnet de bain" }],
    });
  });

  it("given an item another device removed and unticked, when a stale local list is imported, then nothing comes back and nothing is written", async () => {
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "add",
      id: EXTRA,
      label: "Bonnet de bain",
    });
    await service.changeChecklist(PARENT, event.id.value, { kind: "remove", itemId: EXTRA });
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: TOWEL,
      done: false,
    });
    repo.save.mockClear();
    outbox.enqueue.mockClear();

    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "import",
      checklist: {
        done: [EXTRA, TOWEL],
        removed: [],
        extra: [{ id: EXTRA, label: "Bonnet de bain" }],
      },
    });

    expect(result.getValue().checklist).toEqual({ done: [], removed: [], extra: [] });
    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a checklist ticked then unticked back to empty, when a stale local list is imported, then it stays empty", async () => {
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: TOWEL,
      done: true,
    });
    await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: TOWEL,
      done: false,
    });

    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "import",
      checklist: { done: [TOWEL], removed: [], extra: [] },
    });

    expect(result.getValue().checklist.done).toEqual([]);
  });

  it("given a local checklist already merged, when it is imported again, then nothing is written", async () => {
    const local = { done: [SWIMSUIT], removed: [], extra: [] };
    await service.changeChecklist(PARENT, event.id.value, { kind: "import", checklist: local });
    repo.save.mockClear();

    await service.changeChecklist(PARENT, event.id.value, { kind: "import", checklist: local });

    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given an event the parent does not own, then EVENT_NOT_FOUND and nothing is written", async () => {
    repo.lockOwned.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.changeChecklist(PARENT, event.id.value, {
      kind: "tick",
      itemId: SWIMSUIT,
      done: true,
    });

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe("remove", () => {
  it("given an owned event, then it is tombstoned, its alert cancelled and EVENT_DELETED enqueued", async () => {
    const result = await service.remove(PARENT, event.id.value);

    expect(result.isSuccess).toBe(true);
    expect(repo.save.mock.calls[0]?.[0].get("deletedAt")).toEqual(Option.some(NOW));
    expect(planner.cancel).toHaveBeenCalledWith(event.id.value, PARENT);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.EVENT_DELETED,
        aggregateId: event.id.value,
        payload: { userId: PARENT, eventId: event.id.value },
      },
    ]);
  });

  it("given the parent deletes a coursework hiding an announcement of its day, then the announcement's alert is planned with the parent as actor", async () => {
    const coursework = given({ source: "coursework" });
    const hidden = agendaEvent();
    repo.listAnnouncementsOn.mockResolvedValue(Result.ok([hidden]));

    await service.remove(PARENT, coursework.id.value);

    expect(repo.listAnnouncementsOn).toHaveBeenCalledWith(PARENT, {
      childId: coursework.get("childId"),
      courseId: "course-1",
      deadlineDate: "2026-11-19",
    });
    expect(planner.planDefault).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: hidden.id.value, actorUserId: PARENT }),
    );
  });

  it("given the parent moves a coursework to another day, then the announcement of the day it left gets its alert", async () => {
    given({ source: "coursework" });
    const hidden = agendaEvent();
    repo.listAnnouncementsOn.mockResolvedValue(Result.ok([hidden]));

    await service.edit(PARENT, event.id.value, { deadlineDate: "2026-11-26" });

    expect(repo.listAnnouncementsOn).toHaveBeenCalledWith(
      PARENT,
      expect.objectContaining({ deadlineDate: "2026-11-19" }),
    );
    expect(planner.planDefault).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: hidden.id.value, actorUserId: PARENT }),
    );
  });

  it("given an event already deleted, then the second delete answers EVENT_NOT_FOUND", async () => {
    await service.remove(PARENT, event.id.value);
    repo.lockOwned.mockResolvedValue(Result.ok(Option.none()));

    const second = await service.remove(PARENT, event.id.value);

    expect(second.getError().code).toBe("EVENT_NOT_FOUND");
    expect(planner.cancel).toHaveBeenCalledTimes(1);
  });
});

describe("an event of a child being disconnected", () => {
  beforeEach(() => {
    children.idsOf.mockResolvedValue(Result.ok([]));
  });

  it("given an edit, then it answers not found and writes nothing", async () => {
    const result = await service.edit(PARENT, event.id.value, { title: "Autre" });

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a confirmation, then it answers not found and plans nothing", async () => {
    given({ status: "needs_review" });

    const result = await service.confirm(PARENT, event.id.value);

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
    expect(planner.planDefault).not.toHaveBeenCalled();
  });

  it("given a deletion, then it answers not found and cancels nothing", async () => {
    const result = await service.remove(PARENT, event.id.value);

    expect(result.getError().code).toBe("EVENT_NOT_FOUND");
    expect(repo.save).not.toHaveBeenCalled();
    expect(planner.cancel).not.toHaveBeenCalled();
  });
});
