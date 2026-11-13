/**
 * Proves against a real Postgres what mocked ports cannot: the feed row stores only the
 * SHA-256 of its secret, a rotation kills the previous link, the calendar lists the owner's
 * confirmed events of the last 30 days onwards (never another family's, never one to review,
 * deleted or too old) with their planned reminders, a scope narrows it to one child, a poll
 * within the hour writes nothing, a revoke and an account deletion remove the row, and each
 * change lands in the outbox with the parent. Two concurrent creations both succeed on one
 * row, a manual event carries no Classroom link, and past the 500 events cap the history goes
 * before any upcoming deadline.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-calendar-feed", process.env.DATABASE_URL);

import { createHash } from "node:crypto";
import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { calendarFeed } from "@modules/calendar-feed/schemas/calendar-feed.schema";
import { seedChild, seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { shiftDate } from "@packages/ddd-kit/days";
import { asc, authSchema, db, eq, inArray, like, outboxSchema } from "@packages/drizzle";
import { app } from "../src/app";
import { di } from "../src/container";

const now = new Date();
const today = now.toISOString().slice(0, 10);
const probe = `check-calendar-feed-${crypto.randomUUID()}`;
const service = di.CalendarFeedService;
const FEED_EVENT_TYPES = [
  "calendar.feed.created",
  "calendar.feed.rotated",
  "calendar.feed.revoked",
];
const feedIds = new Set<string>();
const calendarClient = {
  server: { requestIP: () => ({ address: "203.0.113.7", family: "IPv4", port: 443 }) },
};

interface SeededEvent {
  name: string;
  childId: string;
  date: string;
  time?: string;
  status?: "confirmed" | "needs_review";
  deleted?: boolean;
  manual?: boolean;
}

function eventRow(userId: string, event: SeededEvent) {
  return {
    userId,
    childId: event.childId,
    announcementId: `announcement-${event.name}`,
    ordinal: 0,
    source: event.manual ? ("manual" as const) : ("announcement" as const),
    courseId: event.manual ? null : `course-${event.name}`,
    announcementUrl: event.manual ? null : "https://classroom.google.com/c/course-1/p/1",
    title: `Échéance ${event.name}`,
    description: `Détail ${event.name}`,
    category: "assessment" as const,
    deadlineDate: event.date,
    deadlineTime: event.time ?? null,
    deadlineAt: new Date(`${event.date}T${event.time ?? "22:59:00"}Z`),
    receivedAt: now,
    status: event.status ?? "confirmed",
    deletedAt: event.deleted ? now : null,
  };
}

async function seedEvent(userId: string, event: SeededEvent): Promise<string> {
  const [row] = await db
    .insert(agendaEvent)
    .values(eventRow(userId, event))
    .returning({ id: agendaEvent.id });
  if (!row) throw new Error(`event ${event.name} not seeded`);

  return row.id;
}

function inDays(days: number): string {
  return shiftDate(today, days);
}

function compact(isoDate: string): string {
  return isoDate.replaceAll("-", "");
}

function secretOf(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1, -".ics".length);
}

async function feedRows(userId: string) {
  return db.select().from(calendarFeed).where(eq(calendarFeed.userId, userId));
}

async function fetched(secret: string): Promise<Response> {
  return app.request(`/calendar/${secret}.ics`, undefined, calendarClient);
}

async function rendered(secret: string): Promise<string> {
  const response = await fetched(secret);
  if (response.status !== 200) throw new Error(`feed answered ${response.status}`);

  return response.text();
}

async function feedEventsOf(userId: string) {
  const rows = await db
    .select({
      type: outboxSchema.outboxEvent.eventType,
      feedId: outboxSchema.outboxEvent.aggregateId,
      payload: outboxSchema.outboxEvent.payload,
    })
    .from(outboxSchema.outboxEvent)
    .where(inArray(outboxSchema.outboxEvent.eventType, FEED_EVENT_TYPES))
    .orderBy(asc(outboxSchema.outboxEvent.occurredAt), asc(outboxSchema.outboxEvent.id));
  const mine = rows.filter((row) => JSON.stringify(row.payload).includes(`"${userId}"`));
  for (const { feedId } of mine) feedIds.add(feedId);

  return mine;
}

async function cleanup(): Promise<void> {
  if (feedIds.size > 0) {
    await db
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.aggregateId, [...feedIds]));
  }
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
}

const { step, run } = stepRunner("check-calendar-feed", cleanup);

run(async () => {
  const parent = `${probe}-a`;
  const lea = await seedParentWithChild({ userId: parent, name: "lea", at: now, label: "Léa" });
  const tom = await seedChild({ userId: parent, name: "tom", at: now, label: "Tom" });
  const other = `${probe}-b`;
  const otherChild = await seedParentWithChild({ userId: other, name: "zoe", at: now });

  const timed = await seedEvent(parent, {
    name: "timed",
    childId: lea,
    date: inDays(5),
    time: "07:30:00",
  });
  const allDay = await seedEvent(parent, { name: "all-day", childId: tom, date: inDays(7) });
  const recent = await seedEvent(parent, { name: "recent", childId: lea, date: inDays(-10) });
  const tooOld = await seedEvent(parent, { name: "too-old", childId: lea, date: inDays(-40) });
  const toReview = await seedEvent(parent, {
    name: "to-review",
    childId: lea,
    date: inDays(6),
    status: "needs_review",
  });
  const deleted = await seedEvent(parent, {
    name: "deleted",
    childId: lea,
    date: inDays(8),
    deleted: true,
  });
  const foreign = await seedEvent(other, { name: "foreign", childId: otherChild, date: inDays(5) });
  await db.insert(alert).values({
    userId: parent,
    eventId: timed,
    reminder: "d2@18:00",
    dueAt: new Date(`${inDays(3)}T17:00:00.000Z`),
    deadlineAt: new Date(`${inDays(5)}T07:30:00.000Z`),
    origin: "default",
    status: "pending",
  });

  const issued = await service.issue(parent, {});
  await step("a parent creates a feed", issued.isSuccess, issued);
  const first = secretOf(issued.getValue().url);
  const [stored] = await feedRows(parent);
  await step(
    "the row holds the SHA-256 of the secret, never the secret",
    stored?.secretHash === createHash("sha256").update(first).digest("hex") &&
      !JSON.stringify(stored).includes(first),
    stored,
  );

  const response = await fetched(first);
  await step(
    "the feed answers as a private calendar cached 15 minutes",
    response.status === 200 &&
      response.headers.get("content-type") === "text/calendar; charset=utf-8" &&
      response.headers.get("cache-control") === "private, max-age=900",
    [response.status, ...response.headers.entries()],
  );
  const calendar = await response.text();
  const uids = [...calendar.matchAll(/UID:([^@]+)@/g)].map((match) => match[1]);
  await step(
    "the calendar lists the owner's confirmed events of the last 30 days onwards only",
    uids.length === 3 &&
      [timed, allDay, recent].every((id) => uids.includes(id)) &&
      ![tooOld, toReview, deleted, foreign].some((id) => uids.includes(id)),
    uids,
  );
  await step(
    "the planned reminder rings as an alarm and the child names the event",
    calendar.includes(`TRIGGER;VALUE=DATE-TIME:${compact(inDays(3))}T170000Z`) &&
      calendar.includes("SUMMARY:Léa · Échéance timed") &&
      calendar.includes(`DTSTART;TZID=Europe/Paris:${compact(inDays(5))}T073000`) &&
      calendar.includes(`DTSTART;VALUE=DATE:${compact(inDays(7))}`),
    calendar,
  );
  const fetchedAt = (await feedRows(parent))[0]?.lastFetchedAt?.toISOString();
  await step(
    "the first fetch is recorded",
    fetchedAt !== undefined && fetchedAt >= now.toISOString(),
    fetchedAt,
  );

  await rendered(first);
  const unchanged = (await feedRows(parent))[0]?.lastFetchedAt?.toISOString();
  await step("a poll within the hour writes nothing", unchanged === fetchedAt, unchanged);

  const rotated = await service.issue(parent, { childIds: [tom] });
  const second = secretOf(rotated.getValue().url);
  await step("a rotation kills the previous link", (await fetched(first)).status === 404);
  const scoped = await rendered(second);
  await step(
    "a feed scoped to one child lists only that child",
    scoped.includes(`UID:${allDay}@`) && !scoped.includes(`UID:${timed}@`),
    scoped,
  );

  const stranger = await service.issue(parent, { childIds: [otherChild] });
  await step(
    "another family's child cannot be put in the scope",
    stranger.isFailure && stranger.getError().code === "CALENDAR_FEED_CHILD_NOT_FOUND",
  );

  await service.revoke(parent);
  await step(
    "a revoked link serves nothing and its row is gone",
    (await fetched(second)).status === 404 && (await feedRows(parent)).length === 0,
  );

  const mine = await feedEventsOf(parent);
  await step(
    "each change lands in the outbox with the parent",
    mine.map((event) => event.type).join(",") ===
      "calendar.feed.created,calendar.feed.rotated,calendar.feed.revoked",
    mine,
  );

  const racing = await Promise.all([service.issue(parent, {}), service.issue(parent, {})]);
  const raced = await feedEventsOf(parent);
  await step(
    "two concurrent creations both succeed on one row, one created and one rotated",
    racing.every((result) => result.isSuccess) &&
      (await feedRows(parent)).length === 1 &&
      raced
        .slice(3)
        .map((event) => event.type)
        .sort()
        .join(",") === "calendar.feed.created,calendar.feed.rotated",
    [racing.map((result) => (result.isSuccess ? "ok" : result.getError().code)), raced],
  );

  const manual = await seedEvent(parent, {
    name: "manual",
    childId: lea,
    date: inDays(9),
    manual: true,
  });
  const live = await service.issue(parent, {});
  const withManual = await rendered(secretOf(live.getValue().url));
  const manualBlock = withManual.slice(withManual.indexOf(`UID:${manual}@`));
  const manualEvent = manualBlock.slice(0, manualBlock.indexOf("END:VEVENT"));
  await step(
    "a manual event is listed without any Classroom link",
    manualEvent.length > 0 && !manualEvent.includes("URL:") && !manualEvent.includes("Classroom"),
    manualEvent,
  );

  await db.insert(agendaEvent).values(
    Array.from({ length: 500 }, (_, index) =>
      eventRow(parent, {
        name: `history-${index}`,
        childId: lea,
        date: inDays(-1 - (index % 29)),
      }),
    ),
  );
  const capped = await rendered(secretOf(live.getValue().url));
  const cappedUids = [...capped.matchAll(/UID:([^@]+)@/g)].map((match) => match[1]);
  await step(
    "past the 500 events cap, the history goes before any upcoming deadline",
    cappedUids.length === 500 && [timed, allDay, manual].every((id) => cappedUids.includes(id)),
    cappedUids.length,
  );

  await feedEventsOf(parent);
  await db.delete(authSchema.user).where(eq(authSchema.user.id, parent));
  await step("deleting the account deletes the feed", (await feedRows(parent)).length === 0);
}, "the calendar feed serves only its owner's deadlines on a real database");
