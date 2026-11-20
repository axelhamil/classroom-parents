import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type { IEventSummaries } from "../application/ports/event-summaries.port";
import type {
  INotificationRepository,
  NotificationDraft,
  StoredNotification,
} from "../application/ports/notification-repository.port";
import { NotificationFeedService } from "../application/services/notification-feed.service";
import { NotificationPostingService } from "../application/services/notification-posting.service";

const PARENT = "parent-1";
const JADE = "child-jade";
const NOW = new Date("2026-11-19T18:00:00.000Z");

let repository: PortMock<INotificationRepository>;
let events: PortMock<IEventSummaries>;
let outbox: PortMock<IOutboxRepository>;
let posting: NotificationPostingService;
let feed: NotificationFeedService;

beforeEach(() => {
  repository = mockPort<INotificationRepository>();
  events = mockPort<IEventSummaries>();
  outbox = mockPort<IOutboxRepository>();
  const { unitOfWork } = mockUnitOfWork();
  const instrumentation = mockInstrumentation();

  posting = new NotificationPostingService(repository, unitOfWork, outbox, instrumentation);
  feed = new NotificationFeedService(
    repository,
    events,
    unitOfWork,
    outbox,
    instrumentation,
    () => NOW,
  );
});

const draft: NotificationDraft = {
  userId: PARENT,
  ref: `to-check:${JADE}:2026-11-19`,
  childId: Option.some(JADE),
  content: { kind: "dates_to_check", eventIds: ["e2"] },
  at: NOW,
};

function stored(id: string, content: StoredNotification["content"]): StoredNotification {
  return { id, childId: Option.none(), content, createdAt: NOW, readAt: Option.none() };
}

describe("posting a notification", () => {
  it("given a new date to check joins an open group, then the center is told a grouped notification arrived", async () => {
    repository.post.mockResolvedValue(
      Result.ok(Option.some({ notificationId: "n1", grouped: true })),
    );

    const result = await posting.post(draft);

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_CREATED,
        aggregateId: "n1",
        payload: {
          userId: PARENT,
          notificationId: "n1",
          kind: "dates_to_check",
          grouped: true,
          actorUserId: null,
        },
      },
    ]);
  });

  it("given the same event delivered again, then nothing changes and nothing is announced", async () => {
    repository.post.mockResolvedValue(Result.ok(Option.none()));

    const result = await posting.post(draft);

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("reading the feed", () => {
  it("given notifications about events, then each carries the title of its event, and none when the event is gone", async () => {
    repository.page.mockResolvedValue(
      Result.ok({
        notifications: [
          stored("n1", { kind: "deadline_reminder", eventId: "e1" }),
          stored("n2", { kind: "dates_to_check", eventIds: ["gone", "e3"] }),
          stored("n3", { kind: "new_deadlines", count: 3 }),
        ],
        nextCursor: Option.some("cursor"),
      }),
    );
    events.summariesOf.mockResolvedValue(
      Result.ok(new Map([["e1", { title: "Exercices page 42", childId: JADE }]])),
    );

    const listed = (await feed.list(PARENT, Option.none(), 20)).getValue();

    expect(events.summariesOf).toHaveBeenCalledWith(PARENT, ["e1", "gone"]);
    expect(listed.notifications.map(({ event }) => event.toNull())).toEqual([
      { id: "e1", title: "Exercices page 42", childId: JADE },
      null,
      null,
    ]);
    expect(listed.nextCursor).toEqual(Option.some("cursor"));
  });
});

describe("marking read", () => {
  it("given an unread notification, then it is read and every screen of the parent is told", async () => {
    repository.markRead.mockResolvedValue(Result.ok("read"));

    const result = await feed.markRead(PARENT, "n1");

    expect(result.isSuccess).toBe(true);
    expect(repository.markRead).toHaveBeenCalledWith(PARENT, "n1", NOW);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATION_READ,
        aggregateId: "n1",
        payload: { userId: PARENT, notificationId: "n1" },
      },
    ]);
  });

  it("given a notification already read, then it succeeds without announcing anything", async () => {
    repository.markRead.mockResolvedValue(Result.ok("already_read"));

    const result = await feed.markRead(PARENT, "n1");

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a notification the parent does not own, then it is not found", async () => {
    repository.markRead.mockResolvedValue(Result.ok("absent"));

    const result = await feed.markRead(PARENT, "n-of-another");

    expect(result.getError().code).toBe("NOTIFICATION_NOT_FOUND");
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given a push opened before its notification was written, then nothing is read and nothing fails", async () => {
    repository.markReadByRef.mockResolvedValue(Result.ok(Option.none()));

    const result = await feed.markReadByRef(PARENT, "reminders:a1");

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it("given an opened push, then its notification is read and announced", async () => {
    repository.markReadByRef.mockResolvedValue(Result.ok(Option.some("n1")));

    await feed.markReadByRef(PARENT, "reminders:a1");

    expect(enqueuedEvents(outbox).map(({ eventType }) => eventType)).toEqual([
      EventTypes.NOTIFICATION_READ,
    ]);
  });

  it("given three unread notifications, then reading them all announces the count once", async () => {
    repository.markAllRead.mockResolvedValue(Result.ok(3));

    const result = await feed.markAllRead(PARENT);

    expect(result.getValue()).toBe(3);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.NOTIFICATIONS_READ_ALL,
        aggregateId: PARENT,
        payload: { userId: PARENT, count: 3 },
      },
    ]);
  });

  it("given nothing unread, then reading all announces nothing", async () => {
    repository.markAllRead.mockResolvedValue(Result.ok(0));

    await feed.markAllRead(PARENT);

    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});
