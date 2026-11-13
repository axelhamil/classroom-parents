import { beforeEach, describe, expect, it } from "bun:test";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  AgendaError,
  EventPage,
  IEventRepository,
} from "../application/ports/event-repository.port";
import type { IVisibleChildren } from "../application/ports/visible-children.port";
import { EventQueryService } from "../application/services/event-query.service";
import type { AgendaEvent } from "../domain/event.aggregate";
import { agendaEvent, CHILD, PARENT } from "../testing/agenda-event.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");
const LEAVING = "0196a000-0000-7000-8000-000000000002";

let repo: PortMock<IEventRepository>;
let children: PortMock<IVisibleChildren>;
let service: EventQueryService;

beforeEach(() => {
  repo = mockPort<IEventRepository>();
  children = mockPort<IVisibleChildren>();
  children.idsOf.mockResolvedValue(Result.ok([CHILD]));
  service = new EventQueryService(repo, children, mockInstrumentation());
});

describe("list", () => {
  it("given child and category filters, then upcoming asks the repository for them at now and returns the next cursor", async () => {
    const event = agendaEvent({ deadlineTime: "08:30" });
    repo.listUpcoming.mockResolvedValue(
      Result.ok<EventPage, AgendaError>({ events: [event], nextCursor: Option.some("next") }),
    );
    const filter = {
      childIds: [CHILD],
      categories: ["assessment" as const],
      cursor: { at: "2026-11-19 07:30:00+00", id: event.id.value },
      limit: 20,
    };

    const result = await service.listUpcoming(PARENT, filter, NOW);

    expect(repo.listUpcoming).toHaveBeenCalledWith(PARENT, { ...filter, done: false }, NOW);
    expect(result.getValue()).toEqual({
      items: [
        {
          id: event.id.value,
          childId: CHILD,
          title: "Contrôle de maths",
          description: "Chapitre 3",
          category: "assessment",
          deadlineDate: "2026-11-19",
          deadlineTime: "08:30",
          deadlineAt: "2026-11-19T07:30:00.000Z",
          status: "confirmed",
          source: "announcement",
          done: false,
          announcementUrl: "https://classroom.google.com/c/course-1/p/announcement-1",
          receivedAt: "2026-11-09T07:00:00.000Z",
          edited: false,
          editedFields: [],
          checklist: { done: [], removed: [], extra: [] },
        },
      ],
      nextCursor: "next",
    });
  });

  it("given the last page of history, then no next cursor is returned", async () => {
    repo.listHistory.mockResolvedValue(
      Result.ok<EventPage, AgendaError>({ events: [], nextCursor: Option.none() }),
    );

    const result = await service.listHistory(PARENT, { limit: 20 }, NOW);

    expect(repo.listHistory).toHaveBeenCalledWith(PARENT, { limit: 20, childIds: [CHILD] }, NOW);
    expect(result.getValue()).toEqual({ items: [], nextCursor: undefined });
  });
});

describe("list by done state", () => {
  beforeEach(() => {
    repo.listUpcoming.mockResolvedValue(
      Result.ok<EventPage, AgendaError>({ events: [], nextCursor: Option.none() }),
    );
    repo.listHistory.mockResolvedValue(
      Result.ok<EventPage, AgendaError>({ events: [], nextCursor: Option.none() }),
    );
  });

  it("given no done filter, then upcoming lists only the events to do", async () => {
    await service.listUpcoming(PARENT, { limit: 20 }, NOW);

    expect(repo.listUpcoming.mock.calls[0]?.[1].done).toBe(false);
  });

  it("given done=true, then upcoming lists only the done events", async () => {
    await service.listUpcoming(PARENT, { limit: 20, done: true }, NOW);

    expect(repo.listUpcoming.mock.calls[0]?.[1].done).toBe(true);
  });

  it("given no done filter, then history lists done and to-do events alike", async () => {
    await service.listHistory(PARENT, { limit: 20 }, NOW);

    expect(repo.listHistory.mock.calls[0]?.[1].done).toBeUndefined();
  });
});

describe("list while a child is being disconnected", () => {
  beforeEach(() => {
    repo.listUpcoming.mockResolvedValue(
      Result.ok<EventPage, AgendaError>({ events: [], nextCursor: Option.none() }),
    );
  });

  it("given no child filter, then only the children still visible are listed", async () => {
    await service.listUpcoming(PARENT, { limit: 20 }, NOW);

    expect(children.idsOf).toHaveBeenCalledWith(PARENT);
    expect(repo.listUpcoming).toHaveBeenCalledWith(
      PARENT,
      { limit: 20, childIds: [CHILD], done: false },
      NOW,
    );
  });

  it("given a filter naming the child being disconnected, then it is dropped from the filter", async () => {
    await service.listUpcoming(PARENT, { limit: 20, childIds: [CHILD, LEAVING] }, NOW);

    expect(repo.listUpcoming).toHaveBeenCalledWith(
      PARENT,
      { limit: 20, childIds: [CHILD], done: false },
      NOW,
    );
  });

  it("given only the child being disconnected, then the page is empty without reading events", async () => {
    const result = await service.listHistory(PARENT, { limit: 20, childIds: [LEAVING] }, NOW);

    expect(repo.listHistory).not.toHaveBeenCalled();
    expect(result.getValue()).toEqual({ items: [], nextCursor: undefined });
  });

  it("given the children cannot be read, then the listing fails", async () => {
    const down: AppError = { code: "CHILD_PROVIDER_FAILURE", message: "down" };
    children.idsOf.mockResolvedValue(Result.fail(down));

    const result = await service.listUpcoming(PARENT, { limit: 20 }, NOW);

    expect(result.getError()).toEqual(down);
    expect(repo.listUpcoming).not.toHaveBeenCalled();
  });
});

describe("calendar", () => {
  beforeEach(() => {
    repo.listCalendar.mockResolvedValue(Result.ok<AgendaEvent[], AgendaError>([agendaEvent()]));
  });

  it("given a month, then every event of its days is read for the visible children only", async () => {
    const result = await service.listCalendar(PARENT, {
      from: "2026-11-01",
      to: "2026-11-30",
      childIds: [CHILD, LEAVING],
      categories: ["homework"],
    });

    const [userId, filter] = repo.listCalendar.mock.calls[0] ?? [];
    expect(userId).toBe(PARENT);
    expect(filter?.childIds).toEqual([CHILD]);
    expect(filter?.categories).toEqual(["homework"]);
    expect(filter?.range.value.from).toBe("2026-11-01");
    expect(filter?.range.value.to).toBe("2026-11-30");
    expect(result.getValue().items).toHaveLength(1);
  });

  it("given more than 62 days, then EVENT_RANGE_INVALID and nothing is read", async () => {
    const result = await service.listCalendar(PARENT, { from: "2026-11-01", to: "2027-01-02" });

    expect(result.getError().code).toBe("EVENT_RANGE_INVALID");
    expect(repo.listCalendar).not.toHaveBeenCalled();
  });

  it("given only a child being disconnected, then the calendar is empty without reading events", async () => {
    const result = await service.listCalendar(PARENT, {
      from: "2026-11-01",
      to: "2026-11-30",
      childIds: [LEAVING],
    });

    expect(result.getValue()).toEqual({ items: [] });
    expect(repo.listCalendar).not.toHaveBeenCalled();
  });
});

describe("get", () => {
  it("given an event of a child being disconnected, then nothing is found", async () => {
    repo.findOwned.mockResolvedValue(
      Result.ok<Option<AgendaEvent>, AgendaError>(Option.some(agendaEvent())),
    );
    children.idsOf.mockResolvedValue(Result.ok([]));

    const result = await service.get(PARENT, "0196a000-0000-7000-8000-00000000abcd");

    expect(result.getValue().isNone()).toBe(true);
  });

  it("given an event of a visible child, then it is found", async () => {
    repo.findOwned.mockResolvedValue(
      Result.ok<Option<AgendaEvent>, AgendaError>(Option.some(agendaEvent())),
    );

    const result = await service.get(PARENT, "0196a000-0000-7000-8000-00000000abcd");

    expect(result.getValue().isSome()).toBe(true);
  });

  it("given an event the parent does not own, then nothing is found", async () => {
    repo.findOwned.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.get(PARENT, "0196a000-0000-7000-8000-00000000abcd");

    expect(result.getValue().isNone()).toBe(true);
  });
});

describe("confirmedSince", () => {
  const SINCE = new Date("2026-10-11T09:00:00.000Z");

  it("given a calendar scoped to a visible child and a child being disconnected, then only the visible child is read", async () => {
    repo.listConfirmedSince.mockResolvedValue(
      Result.ok<AgendaEvent[], AgendaError>([agendaEvent()]),
    );

    const result = await service.confirmedSince(PARENT, {
      childIds: [CHILD, LEAVING],
      since: SINCE,
      now: NOW,
      limit: 500,
    });

    expect(repo.listConfirmedSince).toHaveBeenCalledWith(
      PARENT,
      [CHILD],
      { since: SINCE, now: NOW },
      500,
    );
    expect(result.getValue()).toHaveLength(1);
  });

  it("given a calendar scoped only to children no longer visible, then nothing is read", async () => {
    const result = await service.confirmedSince(PARENT, {
      childIds: [LEAVING],
      since: SINCE,
      now: NOW,
      limit: 500,
    });

    expect(result.getValue()).toEqual([]);
    expect(repo.listConfirmedSince).not.toHaveBeenCalled();
  });
});
