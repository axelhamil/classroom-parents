import { describe, expect, it } from "bun:test";
import type { EventDto } from "@modules/agenda/application/dto/event.dto";
import type { ConfirmedSinceRequest } from "@modules/agenda/application/services/event-query.service";
import type { ChildDto } from "@modules/children/application/dto/child.dto";
import type { ChildrenError } from "@modules/children/application/ports/child-repository.port";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { feedEntriesFor } from "../bindings";

const FAMILY = "parent-a";
const LEA = "0196a000-0000-7000-8000-00000000000a";
const EXAM = "0196a000-0000-7000-8000-0000000000e1";
const SINCE = new Date("2026-10-13T00:00:00Z");
const NOW = new Date("2026-11-12T00:00:00Z");
const RING = new Date("2026-11-18T17:00:00Z");

const exam: EventDto = {
  id: EXAM,
  childId: LEA,
  title: "Contrôle de maths",
  description: "Chapitre 3",
  category: "assessment",
  deadlineDate: "2026-11-19",
  deadlineTime: "08:30",
  deadlineAt: "2026-11-19T07:30:00.000Z",
  status: "confirmed",
  source: "announcement",
  done: false,
  announcementUrl: "https://classroom.google.com/c/1/p/2",
  receivedAt: "2026-11-09T07:00:00.000Z",
  edited: false,
  editedFields: [],
};

const children = {
  list: async () =>
    Result.ok<ChildDto[], ChildrenError>([
      {
        id: LEA,
        label: "Léa",
        googleEmail: "lea@school.example",
        status: "connected",
        syncing: false,
        color: 1,
        avatarUrl: null,
      },
    ]),
};

const alarms = {
  alarmsOf: async (_userId: string, eventIds: string[]) =>
    Result.ok<Map<string, Date[]>, AppError>(new Map(eventIds.map((id) => [id, [RING]]))),
};

describe("calendar feed IFeedEntries bound to the agenda", () => {
  it("labels each confirmed deadline with its child, category and planned alarms", async () => {
    let asked: ConfirmedSinceRequest | undefined;
    const agenda = {
      confirmedSince: async (_userId: string, request: ConfirmedSinceRequest) => {
        asked = request;
        return Result.ok<EventDto[], AppError>([exam, { ...exam, deadlineTime: undefined }]);
      },
    };

    const result = await feedEntriesFor(agenda, children, alarms).list({
      userId: FAMILY,
      childIds: Option.some([LEA]),
      since: SINCE,
      now: NOW,
    });

    expect(asked?.childIds).toEqual([LEA]);
    expect(asked?.since).toBe(SINCE);
    const [timed, allDay] = result.getValue();
    expect(timed).toMatchObject({
      eventId: EXAM,
      childLabel: "Léa",
      categoryLabel: "Évaluation",
      classroomUrl: Option.some(exam.announcementUrl),
      alarmsAt: [RING],
    });
    expect(timed?.deadlineTime.toUndefined()).toBe("08:30");
    expect(allDay?.deadlineTime.isNone()).toBe(true);
  });

  it("asks every visible child when the feed has no scope", async () => {
    let asked: ConfirmedSinceRequest | undefined;
    const agenda = {
      confirmedSince: async (_userId: string, request: ConfirmedSinceRequest) => {
        asked = request;
        return Result.ok<EventDto[], AppError>([]);
      },
    };

    const result = await feedEntriesFor(agenda, children, alarms).list({
      userId: FAMILY,
      childIds: Option.none(),
      since: SINCE,
      now: NOW,
    });

    expect(asked?.childIds).toBeUndefined();
    expect(result.getValue()).toEqual([]);
  });

  it("passes an alarm read failure through with its code", async () => {
    const agenda = {
      confirmedSince: async () => Result.ok<EventDto[], AppError>([exam]),
    };
    const failing = {
      alarmsOf: async () =>
        Result.fail<Map<string, Date[]>, AppError>({
          code: "CALENDAR_FEED_PROVIDER_FAILURE",
          message: "down",
        }),
    };

    const result = await feedEntriesFor(agenda, children, failing).list({
      userId: FAMILY,
      childIds: Option.none(),
      since: SINCE,
      now: NOW,
    });

    expect(result.getError().code).toBe("CALENDAR_FEED_PROVIDER_FAILURE");
  });
});
