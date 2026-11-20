import { beforeEach, describe, expect, it, type Mock, mock } from "bun:test";
import { type IDomainEvent, Option, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import {
  notifyOnAccessLossSent,
  notifyOnDateToCheck,
  notifyOnDeadlineAmended,
  notifyOnNewDeadlines,
  notifyOnReminderSent,
  notifyOnSchoolAllowed,
  notifyOnWeeklyDigestSent,
} from "../application/event-handlers/notify-on-events";
import type { NotificationDraft } from "../application/ports/notification-repository.port";

const PARENT = "parent-1";
const JADE = "0196a000-0000-7000-8000-0000000000c1";
const EVENT = "0196a000-0000-7000-8000-0000000000e1";
const AT = new Date("2026-11-19T18:00:00.000Z");

type Post = (draft: NotificationDraft) => Promise<Result<void, never>>;

let post: Mock<Post>;
let deps: { NotificationPostingService: { post: Post } };

beforeEach(() => {
  post = mock<Post>(async () => Result.ok());
  deps = { NotificationPostingService: { post } };
});

function delivered(eventType: string, payload: unknown, at = AT): IDomainEvent {
  return { eventType, aggregateId: "aggregate", dateOccurred: at, payload };
}

function posted(): NotificationDraft[] {
  return post.mock.calls.map(([draft]) => draft);
}

function alertSent(alertId: string, group: { key: string; size: number }): IDomainEvent {
  return delivered(EventTypes.ALERT_SENT, {
    userId: PARENT,
    alertId,
    eventId: EVENT,
    group,
    channel: "push",
    actorUserId: null,
  });
}

describe("a reminder reaching the parent", () => {
  it("given one alert sent alone, then the center shows that deadline under the reference its push carries", async () => {
    await notifyOnReminderSent(deps).handle(alertSent("a1", { key: "a1", size: 1 }));

    expect(posted()).toEqual([
      {
        userId: PARENT,
        ref: "reminders:a1",
        childId: Option.none(),
        content: { kind: "deadline_reminder", eventId: EVENT },
        at: AT,
      },
    ]);
  });

  it("given three alerts sent in one push, then each lands on the same reference counting the three", async () => {
    const handler = notifyOnReminderSent(deps);
    for (const alertId of ["a1", "a2", "a3"])
      await handler.handle(alertSent(alertId, { key: "group-1", size: 3 }));

    expect(new Set(posted().map(({ ref }) => ref))).toEqual(new Set(["reminders:group-1"]));
    expect(posted()[0]?.content).toEqual({ kind: "deadline_reminders", count: 3 });
  });
});

describe("the other sendings of the alerts", () => {
  it("given the Sunday summary was sent, then the center shows the week and its count", async () => {
    await notifyOnWeeklyDigestSent(deps).handle(
      delivered(EventTypes.WEEKLY_DIGEST_SENT, {
        userId: PARENT,
        digestId: "d1",
        weekStart: "2026-11-23",
        channel: "push",
        deadlines: 5,
        actorUserId: null,
      }),
    );

    expect(posted()).toMatchObject([
      {
        ref: "digest:d1",
        content: { kind: "weekly_digest", deadlines: 5, weekStart: "2026-11-23" },
      },
    ]);
  });

  it("given the lost access warning was sent, then the center names the child to reconnect", async () => {
    await notifyOnAccessLossSent(deps).handle(
      delivered(EventTypes.ACCESS_LOSS_ALERT_SENT, {
        userId: PARENT,
        childId: JADE,
        accessAlertId: "w1",
        channel: "email",
        actorUserId: null,
      }),
    );

    expect(posted()).toMatchObject([
      { ref: "access-loss:w1", childId: Option.some(JADE), content: { kind: "access_lost" } },
    ]);
  });
});

describe("what the sync found", () => {
  function synced(eventsCreated: number): IDomainEvent {
    return delivered(EventTypes.ANNOUNCEMENT_SYNCED, {
      userId: PARENT,
      childId: JADE,
      newAnnouncements: 4,
      eventsCreated,
      actorUserId: null,
    });
  }

  it("given a sync that found three deadlines for Jade, then one notification counts them for her", async () => {
    await notifyOnNewDeadlines(deps).handle(synced(3));

    expect(posted()).toMatchObject([
      { childId: Option.some(JADE), content: { kind: "new_deadlines", count: 3 } },
    ]);
  });

  it("given a sync that found nothing, then nothing is notified", async () => {
    await notifyOnNewDeadlines(deps).handle(synced(0));

    expect(post).not.toHaveBeenCalled();
  });

  it("given a later announcement cancelled a deadline, then the center says which one and why", async () => {
    await notifyOnDeadlineAmended(deps).handle(
      delivered(EventTypes.EVENT_FLAGGED, {
        userId: PARENT,
        childId: JADE,
        eventId: EVENT,
        reason: "cancelled",
        reference: "la sortie",
        amendingAnnouncementId: "ann-2",
        actorUserId: null,
      }),
    );

    expect(posted()).toMatchObject([
      {
        ref: `amended:${EVENT}:ann-2`,
        content: { kind: "deadline_amended", eventId: EVENT, reason: "cancelled" },
      },
    ]);
  });

  function created(eventId: string, needsReview: boolean, at = AT): IDomainEvent {
    return delivered(
      EventTypes.EVENT_CREATED,
      { userId: PARENT, childId: JADE, eventId, needsReview, actorUserId: null },
      at,
    );
  }

  it("given two dates to check for Jade the same day, then both join one notification of that child and day", async () => {
    const handler = notifyOnDateToCheck(deps);
    await handler.handle(created("e1", true));
    await handler.handle(created("e2", true, new Date("2026-11-19T21:00:00.000Z")));

    expect(posted().map(({ ref, content }) => ({ ref, content }))).toEqual([
      { ref: `to-check:${JADE}:2026-11-19`, content: { kind: "dates_to_check", eventIds: ["e1"] } },
      { ref: `to-check:${JADE}:2026-11-19`, content: { kind: "dates_to_check", eventIds: ["e2"] } },
    ]);
  });

  it("given a created deadline whose date is sure, then no date to check is notified", async () => {
    await notifyOnDateToCheck(deps).handle(created("e1", false));

    expect(post).not.toHaveBeenCalled();
  });

  it("given a malformed payload, then the handler fails so the relay retries it", async () => {
    const reaction = notifyOnDateToCheck(deps).handle(
      delivered(EventTypes.EVENT_CREATED, { userId: PARENT }),
    );

    await expect(reaction).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("a child's school allowing the app", () => {
  it("given a reconnection that ends a school block, then the center says the school allowed the app", async () => {
    await notifyOnSchoolAllowed(deps).handle(
      delivered(EventTypes.CHILD_CONNECTED, {
        userId: PARENT,
        childId: JADE,
        restoredFrom: "school_blocked",
      }),
    );

    expect(posted()).toMatchObject([
      { childId: Option.some(JADE), content: { kind: "school_allowed" } },
    ]);
  });

  it("given a first connection or the end of an expired Google access, then nothing is posted", async () => {
    const handler = notifyOnSchoolAllowed(deps);
    await handler.handle(delivered(EventTypes.CHILD_CONNECTED, { userId: PARENT, childId: JADE }));
    await handler.handle(
      delivered(EventTypes.CHILD_CONNECTED, {
        userId: PARENT,
        childId: JADE,
        restoredFrom: "invalid_grant",
      }),
    );

    expect(posted()).toEqual([]);
  });
});
