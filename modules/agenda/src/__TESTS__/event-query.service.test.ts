import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type {
  AgendaError,
  EventPage,
  IEventRepository,
} from "../application/ports/event-repository.port";
import { EventQueryService } from "../application/services/event-query.service";
import { agendaEvent, CHILD, PARENT } from "../testing/agenda-event.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");

let repo: PortMock<IEventRepository>;
let service: EventQueryService;

beforeEach(() => {
  repo = mockPort<IEventRepository>();
  service = new EventQueryService(repo, mockInstrumentation());
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

    expect(repo.listUpcoming).toHaveBeenCalledWith(PARENT, filter, NOW);
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

    expect(repo.listHistory).toHaveBeenCalledWith(PARENT, { limit: 20 }, NOW);
    expect(result.getValue()).toEqual({ items: [], nextCursor: undefined });
  });
});

describe("get", () => {
  it("given an event the parent does not own, then nothing is found", async () => {
    repo.findOwned.mockResolvedValue(Result.ok(Option.none()));

    const result = await service.get(PARENT, "0196a000-0000-7000-8000-00000000abcd");

    expect(result.getValue().isNone()).toBe(true);
  });
});
