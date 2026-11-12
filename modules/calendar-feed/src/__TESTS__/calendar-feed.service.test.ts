import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { mockUnitOfWork } from "@packages/test/bun/unit-of-work";
import type {
  CalendarFeedError,
  ICalendarFeedRepository,
} from "../application/ports/calendar-feed-repository.port";
import type { IFeedChildren } from "../application/ports/feed-children.port";
import type { FeedEntry, IFeedEntries } from "../application/ports/feed-entries.port";
import type { IFeedSecrets } from "../application/ports/feed-secrets.port";
import { CalendarFeedService } from "../application/services/calendar-feed.service";
import type { CalendarFeed } from "../domain/calendar-feed.aggregate";
import { FeedScope } from "../domain/value-objects/feed-scope.vo";
import {
  CHILD,
  calendarFeed,
  FEED_ID,
  OLD_HASH,
  OTHER_CHILD,
  PARENT,
} from "../testing/calendar-feed.fixture";

const NOW = new Date("2026-11-10T09:00:00.000Z");
const SECRET = "s".repeat(43);
const NEW_HASH = "b".repeat(64);

const entry: FeedEntry = {
  eventId: "0196a000-0000-7000-8000-0000000000e1",
  childLabel: "Léa",
  title: "Contrôle de maths",
  description: "Chapitre 3",
  categoryLabel: "Évaluation",
  deadlineDate: "2026-11-19",
  deadlineTime: Option.none(),
  classroomUrl: Option.some("https://classroom.google.com/c/abc/p/def"),
  alarmsAt: [],
  doneLabel: Option.none(),
};

let feeds: PortMock<ICalendarFeedRepository>;
let children: PortMock<IFeedChildren>;
let entries: PortMock<IFeedEntries>;
let secrets: PortMock<IFeedSecrets>;
let outbox: PortMock<IOutboxRepository>;
let service: CalendarFeedService;

function given(feed: Option<CalendarFeed>): void {
  feeds.lockOwned.mockResolvedValue(Result.ok<Option<CalendarFeed>, CalendarFeedError>(feed));
  feeds.findOwned.mockResolvedValue(Result.ok<Option<CalendarFeed>, CalendarFeedError>(feed));
  feeds.findBySecretHash.mockResolvedValue(
    Result.ok<Option<CalendarFeed>, CalendarFeedError>(feed),
  );
}

function savedFeed(): CalendarFeed | undefined {
  return feeds.save.mock.calls[0]?.[0] ?? feeds.insertIfAbsent.mock.calls[0]?.[0];
}

beforeEach(() => {
  feeds = mockPort<ICalendarFeedRepository>();
  children = mockPort<IFeedChildren>();
  entries = mockPort<IFeedEntries>();
  secrets = mockPort<IFeedSecrets>();
  outbox = mockPort<IOutboxRepository>();

  given(Option.none());
  feeds.save.mockResolvedValue(Result.ok());
  feeds.insertIfAbsent.mockResolvedValue(Result.ok(true));
  feeds.recordFetch.mockResolvedValue(Result.ok());
  feeds.deleteOwned.mockResolvedValue(Result.ok(Option.none()));
  children.idsOf.mockResolvedValue(Result.ok([CHILD, OTHER_CHILD]));
  entries.list.mockResolvedValue(Result.ok([entry]));
  secrets.issue.mockReturnValue({ secret: SECRET, hash: NEW_HASH });
  secrets.hashOf.mockReturnValue(OLD_HASH);

  service = new CalendarFeedService(
    feeds,
    children,
    entries,
    secrets,
    mockUnitOfWork().unitOfWork,
    outbox,
    mockInstrumentation(),
    { feedOrigin: "https://api.example.fr", appHost: "app.example.fr" },
    () => NOW,
  );
});

describe("issue", () => {
  it("given a parent without a feed, then a feed of every child is created, only the secret's hash is stored and the link is returned once", async () => {
    const result = await service.issue(PARENT, {});

    expect(result.getValue()).toEqual({
      url: `https://api.example.fr/calendar/${SECRET}.ics`,
      createdAt: NOW.toISOString(),
      childIds: null,
    });
    expect(savedFeed()?.get("secretHash").value).toBe(NEW_HASH);
    expect(savedFeed()?.get("userId")).toBe(PARENT);
    expect(JSON.stringify(savedFeed()?.toObject())).not.toContain(SECRET);
    const feedId = savedFeed()?.id.value ?? "missing";
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CALENDAR_FEED_CREATED,
        aggregateId: feedId,
        payload: { userId: PARENT, feedId, childIds: null },
      },
    ]);
  });

  it("given a parent with a feed, then the secret is replaced so the old link dies, the creation date stays and CALENDAR_FEED_ROTATED is emitted", async () => {
    given(Option.some(calendarFeed()));

    const result = await service.issue(PARENT, { childIds: [CHILD] });

    expect(result.getValue()).toEqual({
      url: `https://api.example.fr/calendar/${SECRET}.ics`,
      createdAt: "2026-11-01T08:00:00.000Z",
      childIds: [CHILD],
    });
    expect(savedFeed()?.get("secretHash").value).toBe(NEW_HASH);
    expect(savedFeed()?.get("rotatedAt")).toEqual(Option.some(NOW));
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CALENDAR_FEED_ROTATED,
        aggregateId: FEED_ID,
        payload: { userId: PARENT, feedId: FEED_ID, childIds: [CHILD] },
      },
    ]);
  });

  it("given a concurrent create that stored the parent's feed first, then this one rotates that feed instead of failing", async () => {
    feeds.lockOwned
      .mockResolvedValueOnce(Result.ok<Option<CalendarFeed>, CalendarFeedError>(Option.none()))
      .mockResolvedValueOnce(
        Result.ok<Option<CalendarFeed>, CalendarFeedError>(Option.some(calendarFeed())),
      );
    feeds.insertIfAbsent.mockResolvedValue(Result.ok(false));

    const result = await service.issue(PARENT, {});

    expect(result.getValue().url).toBe(`https://api.example.fr/calendar/${SECRET}.ics`);
    expect(feeds.save.mock.calls[0]?.[0].id.value).toBe(FEED_ID);
    expect(feeds.save.mock.calls[0]?.[0].get("secretHash").value).toBe(NEW_HASH);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CALENDAR_FEED_ROTATED,
        aggregateId: FEED_ID,
        payload: { userId: PARENT, feedId: FEED_ID, childIds: null },
      },
    ]);
  });

  it("given a child that is not one of the parent's linked children, then CALENDAR_FEED_CHILD_NOT_FOUND and nothing is written", async () => {
    children.idsOf.mockResolvedValue(Result.ok([OTHER_CHILD]));

    const result = await service.issue(PARENT, { childIds: [CHILD] });

    expect(result.getError().code).toBe("CALENDAR_FEED_CHILD_NOT_FOUND");
    expect(savedFeed()).toBeUndefined();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it.each([
    ["an empty list", []],
    ["an id that is not a uuid", ["child-1"]],
  ])("given a scope with %s, then CALENDAR_FEED_SCOPE_INVALID", async (_label, childIds) => {
    const result = await service.issue(PARENT, { childIds });

    expect(result.getError().code).toBe("CALENDAR_FEED_SCOPE_INVALID");
    expect(savedFeed()).toBeUndefined();
  });
});

describe("revoke", () => {
  it("given a live feed, then it is deleted and CALENDAR_FEED_REVOKED is emitted", async () => {
    feeds.deleteOwned.mockResolvedValue(Result.ok(Option.some(FEED_ID)));

    const result = await service.revoke(PARENT);

    expect(result.isSuccess).toBe(true);
    expect(feeds.deleteOwned).toHaveBeenCalledWith(PARENT);
    expect(enqueuedEvents(outbox)).toEqual([
      {
        eventType: EventTypes.CALENDAR_FEED_REVOKED,
        aggregateId: FEED_ID,
        payload: { userId: PARENT, feedId: FEED_ID },
      },
    ]);
  });

  it("given no feed, then the revoke succeeds without announcing anything", async () => {
    const result = await service.revoke(PARENT);

    expect(result.isSuccess).toBe(true);
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

describe("status", () => {
  it("given a scoped feed fetched once, then its dates and scope are reported", async () => {
    given(
      Option.some(
        calendarFeed({ lastFetchedAt: Option.some(new Date("2026-11-09T20:00:00.000Z")) }),
      ),
    );

    const result = await service.status(PARENT);

    expect(result.getValue()).toEqual({
      exists: true,
      createdAt: "2026-11-01T08:00:00.000Z",
      rotatedAt: null,
      lastFetchedAt: "2026-11-09T20:00:00.000Z",
      childIds: null,
    });
  });

  it("given no feed, then it reports that none exists", async () => {
    expect((await service.status(PARENT)).getValue()).toEqual({ exists: false });
  });
});

describe("render", () => {
  it("given a secret that cannot be a feed secret, then the feed is absent and the store is never read", async () => {
    const result = await service.render("not-a-secret");

    expect(result.getValue().isNone()).toBe(true);
    expect(feeds.findBySecretHash).not.toHaveBeenCalled();
  });

  it("given a secret whose hash matches no feed, then the feed is absent", async () => {
    const result = await service.render(SECRET);

    expect(result.getValue().isNone()).toBe(true);
    expect(feeds.findBySecretHash.mock.calls[0]?.[0].value).toBe(OLD_HASH);
    expect(entries.list).not.toHaveBeenCalled();
  });

  it("given a feed scoped to one child, then the calendar lists that child's events of the last 30 days onwards", async () => {
    given(Option.some(calendarFeed({ scope: scopeOf([CHILD]) })));

    const result = await service.render(SECRET);

    expect(result.getValue().unwrap()).toContain("SUMMARY:Léa · Contrôle de maths");
    expect(entries.list).toHaveBeenCalledWith({
      userId: PARENT,
      childIds: Option.some([CHILD]),
      since: new Date("2026-10-11T09:00:00.000Z"),
      now: NOW,
    });
  });

  it("given a feed never fetched, then the first fetch is recorded", async () => {
    given(Option.some(calendarFeed()));

    await service.render(SECRET);

    expect(feeds.recordFetch.mock.calls[0]?.[0].get("lastFetchedAt")).toEqual(Option.some(NOW));
  });

  it("given a feed fetched 59 minutes ago, then the poll writes nothing", async () => {
    given(Option.some(calendarFeed({ lastFetchedAt: Option.some(minutesBefore(59)) })));

    await service.render(SECRET);

    expect(feeds.recordFetch).not.toHaveBeenCalled();
  });

  it("given a feed fetched an hour ago, then the poll records the new fetch", async () => {
    given(Option.some(calendarFeed({ lastFetchedAt: Option.some(minutesBefore(60)) })));

    await service.render(SECRET);

    expect(feeds.recordFetch).toHaveBeenCalledTimes(1);
  });
});

function minutesBefore(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * 60_000);
}

function scopeOf(childIds: string[]): FeedScope {
  return FeedScope.fromChildIds(Option.some(childIds)).getValue();
}
