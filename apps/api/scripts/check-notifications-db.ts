/**
 * Proves against a real Postgres what the notification center promises in SQL: one row per
 * reference however often its event is delivered, a group that gathers its members and turns
 * unread again only on a new one, every read and write filtered on its owner, a cursor that
 * walks the whole feed once even through equal instants, the event titles read for the owner
 * only, the 90 days retention sweep, and the cascade with the child and with the account.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-notifications-db", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import type { NotificationDraft } from "@modules/notifications/application/ports/notification-repository.port";
import { notification } from "@modules/notifications/schemas/notification.schema";
import { Option } from "@packages/ddd-kit";
import { shiftInstant } from "@packages/ddd-kit/days";
import {
  and,
  authSchema,
  count,
  db,
  desc,
  eq,
  like,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { notificationsContainer } from "../src/composition/notifications";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { NOTIFICATION_RETENTION_DAYS, sweepNotifications } from "../src/workers/retention";

const probe = `check-notifications-db-${crypto.randomUUID()}`;
const NOW = new Date();
const [E1, E2, E3, LATE] = [1, 2, 3, 4].map(() => crypto.randomUUID());
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});
const center = notificationsContainer({
  IInstrumentation: instrumentation,
  ITransactionService: uow,
  IOutboxRepository: new DrizzleOutboxRepository(instrumentation, () => undefined),
});
const posting = center.NotificationPostingService;
const feed = center.NotificationFeedService;

function reminder(userId: string, ref: string, eventId: string, at = NOW): NotificationDraft {
  return {
    userId,
    ref,
    childId: Option.none(),
    content: { kind: "deadline_reminder", eventId },
    at,
  };
}

function toCheck(userId: string, childId: string, eventId: string): NotificationDraft {
  return {
    userId,
    ref: `to-check:${childId}:day`,
    childId: Option.some(childId),
    content: { kind: "dates_to_check", eventIds: [eventId] },
    at: NOW,
  };
}

async function rowsOf(userId: string) {
  return db.select().from(notification).where(eq(notification.userId, userId));
}

async function createdEventsOf(userId: string): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(
      and(
        eq(outboxEvent.eventType, EventTypes.NOTIFICATION_CREATED),
        eq(sql`${outboxEvent.payload}->>'userId'`, userId),
      ),
    );

  return row?.total ?? 0;
}

async function eventOf(userId: string, childId: string, title: string): Promise<string> {
  const [event] = await db
    .insert(agendaEvent)
    .values({
      userId,
      childId,
      announcementId: `${probe}-${title}`,
      ordinal: 0,
      courseId: "course-1",
      announcementUrl: "https://classroom.google.com/c/course-1",
      title,
      description: "",
      category: "homework",
      deadlineDate: "2030-03-04",
      deadlineTime: null,
      deadlineAt: NOW,
      receivedAt: NOW,
      status: "confirmed",
    })
    .returning({ id: agendaEvent.id });
  if (!event) throw new Error(`event ${title} not created`);

  return event.id;
}

async function walkFeed(userId: string, limit: number): Promise<string[]> {
  const seen: string[] = [];
  let cursor = Option.none<{ at: string; id: string }>();
  for (let page = 0; page < 20; page += 1) {
    const listed = await feed.list(userId, cursor, limit);
    if (listed.isFailure) throw new Error(listed.getError().message);

    const { notifications, nextCursor } = listed.getValue();
    seen.push(...notifications.map(({ id }) => id));
    if (nextCursor.isNone()) return seen;

    const [at = "", id = ""] = nextCursor.unwrap().split("~");
    cursor = Option.some({ at, id });
  }

  return seen;
}

const { step, run } = stepRunner("check-notifications-db", async () => {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
});

run(async () => {
  const jade = `${probe}-jade`;
  const other = `${probe}-other`;
  const jadeChild = await seedParentWithChild({ userId: jade, name: "jade", at: NOW });
  const otherChild = await seedParentWithChild({ userId: other, name: "other", at: NOW });
  const exercises = await eventOf(jade, jadeChild, "Exercices page 42");
  const othersEvent = await eventOf(other, otherChild, "Secret de l'autre famille");

  await posting.post(reminder(jade, "reminders:a1", exercises));
  await posting.post(reminder(jade, "reminders:a1", exercises));
  await step(
    "an event delivered twice writes one notification and announces it once",
    (await rowsOf(jade)).length === 1 && (await createdEventsOf(jade)) === 1,
    { rows: (await rowsOf(jade)).length, announced: await createdEventsOf(jade) },
  );

  await posting.post(toCheck(jade, jadeChild, E1 ?? ""));
  await posting.post(toCheck(jade, jadeChild, E2 ?? ""));
  const [grouped] = (await rowsOf(jade)).filter(({ kind }) => kind === "dates_to_check");
  await step(
    "dates to check of one child and one day gather in one row",
    JSON.stringify(grouped?.members.toSorted()) === JSON.stringify([E1, E2].toSorted()),
    grouped,
  );

  await feed.markRead(jade, grouped?.id ?? "");
  await posting.post(toCheck(jade, jadeChild, E2 ?? ""));
  const [replayed] = await db
    .select({ readAt: notification.readAt })
    .from(notification)
    .where(eq(notification.id, grouped?.id ?? ""));
  await step("a replayed member leaves a read group read", replayed?.readAt !== null, replayed);

  await posting.post(toCheck(jade, jadeChild, E3 ?? ""));
  const [reopened] = await db
    .select({ readAt: notification.readAt, members: notification.members })
    .from(notification)
    .where(eq(notification.id, grouped?.id ?? ""));
  await step(
    "a new member turns the group unread again",
    reopened?.readAt === null && reopened.members.length === 3,
    reopened,
  );

  await posting.post(reminder(other, "reminders:b1", othersEvent));
  const [othersRow] = await rowsOf(other);
  const foreignRead = await feed.markRead(jade, othersRow?.id ?? "");
  await step(
    "a parent cannot read another parent's notification, it reads as absent",
    foreignRead.isFailure && foreignRead.getError().code === "NOTIFICATION_NOT_FOUND",
    foreignRead,
  );

  const jadeFeed = await feed.list(jade, Option.none(), 50);
  const listed = jadeFeed.isSuccess ? jadeFeed.getValue().notifications : [];
  const titles = listed.flatMap(({ event }) => event.map(({ title }) => [title]).unwrapOr([]));
  await step(
    "the feed lists the owner's rows only, with the title of the owner's events",
    listed.length === 2 &&
      JSON.stringify(titles) === JSON.stringify(["Exercices page 42"]) &&
      !listed.some(({ id }) => id === othersRow?.id),
    jadeFeed.isSuccess ? listed : jadeFeed.getError(),
  );

  const forged = await center.IEventSummaries.summariesOf(jade, [othersEvent]);
  await step(
    "an event of another family gives no title",
    forged.isSuccess && forged.getValue().size === 0,
    forged,
  );

  const allRead = await feed.markAllRead(jade);
  const othersUnread = await feed.unreadCount(other);
  await step(
    "reading everything touches the owner's rows only",
    allRead.isSuccess &&
      allRead.getValue() === 2 &&
      othersUnread.isSuccess &&
      othersUnread.getValue() === 1,
    { allRead, othersUnread },
  );

  const sameInstant = shiftInstant(NOW, -1);
  for (let n = 0; n < 23; n += 1)
    await posting.post(
      reminder(
        other,
        `reminders:page-${n}`,
        othersEvent,
        n < 8 ? sameInstant : shiftInstant(NOW, -2 - n),
      ),
    );
  const walked = await walkFeed(other, 5);
  const newestFirst = await db
    .select({ id: notification.id })
    .from(notification)
    .where(eq(notification.userId, other))
    .orderBy(desc(notification.createdAt), desc(notification.id));
  await step(
    "the cursor walks every row once, newest first, even through equal instants",
    walked.length === 24 &&
      JSON.stringify(walked) === JSON.stringify(newestFirst.map(({ id }) => id)),
    { walked: walked.length, distinct: new Set(walked).size },
  );

  await db.insert(notification).values({
    userId: other,
    ref: "reminders:old",
    kind: "deadline_reminder",
    params: { eventId: othersEvent },
    createdAt: shiftInstant(NOW, -(NOTIFICATION_RETENTION_DAYS + 1)),
  });
  const swept = await sweepNotifications({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
  });
  const refs = (await rowsOf(other)).map(({ ref }) => ref);
  await step(
    "notifications past 90 days leave, recent ones stay",
    !swept.skipped && !refs.includes("reminders:old") && refs.length === 24,
    { swept, refs: refs.length },
  );

  await db.delete(childAccount).where(eq(childAccount.id, jadeChild));
  const afterChild = await rowsOf(jade);
  await step(
    "removing a child removes the notifications about that child",
    afterChild.length === 1 && afterChild[0]?.childId === null,
    afterChild,
  );

  const lateDraft = await posting.post(toCheck(jade, jadeChild, LATE ?? ""));
  await step(
    "a notification about a child already removed is dropped, not retried",
    lateDraft.isSuccess && (await rowsOf(jade)).length === 1,
    lateDraft,
  );

  await db.delete(authSchema.user).where(eq(authSchema.user.id, other));
  await step("deleting the account deletes its notifications", (await rowsOf(other)).length === 0);
}, "the notification center groups, isolates, pages, ages out and cascades in SQL");
