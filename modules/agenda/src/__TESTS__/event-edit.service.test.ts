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
      deadlineDate: "2026-11-26",
      deadlineTime: undefined,
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

  it("given an event still to review whose deadline moves, then no alert is replanned", async () => {
    given({ status: "needs_review" });

    await service.edit(PARENT, event.id.value, { deadlineDate: "2026-11-26" });

    expect(planner.replan).not.toHaveBeenCalled();
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

describe("confirm", () => {
  it("given an event to review, then it is confirmed and its default alert planned", async () => {
    given({ status: "needs_review", deadlineTime: "08:30" });

    const result = await service.confirm(PARENT, event.id.value);

    expect(result.getValue().status).toBe("confirmed");
    expect(planner.planDefault).toHaveBeenCalledWith({
      eventId: event.id.value,
      userId: PARENT,
      deadlineDate: "2026-11-19",
      deadlineTime: "08:30",
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
