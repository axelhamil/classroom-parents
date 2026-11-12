/**
 * Proves against a real Postgres what the mocked ports of `data-export.service.test.ts` cannot:
 * the export reads only the requesting parent's rows (the owner filter lives in the host query),
 * keeps withdrawn, deleted and hand-added events, the child color and picture, the calendar feed
 * (never its secret) and the Sunday digest choice and history, with the default choice for a
 * parent who never made one; it never carries a token or a push key, and the 24 h limit is held
 * by the stored request date, so a second request is refused and leaves one event.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-data-export", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import {
  alertDefaultReminders,
  alertEventReminders,
  alertQuietHours,
} from "@modules/alerts/schemas/reminder-settings.schema";
import {
  alertDigestPreference,
  alertWeeklyDigest,
} from "@modules/alerts/schemas/weekly-digest.schema";
import { calendarFeed } from "@modules/calendar-feed/schemas/calendar-feed.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { seenAnnouncement } from "@modules/classroom-sync/schemas/seen-announcement.schema";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  like,
  outboxSchema,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { DataExportService } from "../src/modules/rgpd/application/services/data-export.service";
import { DrizzleRgpdRepository } from "../src/modules/rgpd/infrastructure/repositories/drizzle-rgpd.repository";
import { UserDataQuery } from "../src/queries/user-data.query";
import { logger } from "../src/shared/logger";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const NOW = new Date("2030-03-10T09:00:00.000Z");
const SECRET = "probe-secret-token";
const AVATAR = "https://lh3.googleusercontent.com/a/probe-";
const probe = `check-data-export-${crypto.randomUUID()}`;
const instrumentation = new NoOpInstrumentation();
const service = (at: Date) =>
  new DataExportService(
    new DrizzleRgpdRepository(logger, instrumentation),
    new UserDataQuery(instrumentation),
    new TransactionService(instrumentation),
    new DrizzleOutboxRepository(instrumentation, () => undefined),
    instrumentation,
    () => at,
  );

async function family(name: string): Promise<{ userId: string; childId: string }> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({
    userId,
    name,
    at: NOW,
    label: `Enfant ${name}`,
    color: 5,
  });
  await db
    .update(childAccount)
    .set({ avatarUrl: `${AVATAR}${name}` })
    .where(eq(childAccount.id, childId));
  await db
    .update(authSchema.account)
    .set({ accessToken: SECRET, refreshToken: SECRET })
    .where(eq(authSchema.account.userId, userId));

  const events = await db
    .insert(agendaEvent)
    .values(
      ["kept", "withdrawn", "deleted"].map((state, ordinal) => ({
        userId,
        childId,
        announcementId: `announcement-${name}`,
        ordinal,
        courseId: "course-1",
        announcementUrl: "https://classroom.google.com/c/course-1",
        title: `Devoir ${name} ${state}`,
        description: `Description ${name}`,
        category: "homework" as const,
        deadlineDate: "2030-03-12",
        deadlineAt: NOW,
        receivedAt: NOW,
        status: "confirmed" as const,
        withdrawnAt: state === "withdrawn" ? NOW : null,
        deletedAt: state === "deleted" ? NOW : null,
      })),
    )
    .returning({ id: agendaEvent.id });
  const [kept] = events;
  if (!kept) throw new Error(`events of ${name} not created`);
  await db.insert(agendaEvent).values({
    userId,
    childId,
    source: "manual",
    announcementId: `manual-${name}`,
    ordinal: 0,
    courseId: null,
    announcementUrl: null,
    title: `Sortie ${name}`,
    description: "",
    category: "other",
    deadlineDate: "2030-03-14",
    deadlineAt: NOW,
    receivedAt: NOW,
    status: "confirmed",
  });

  const reminder = { kind: "hours_before" as const, hours: 2 };
  await db.insert(alertEventReminders).values({
    eventId: kept.id,
    userId,
    reminders: [reminder],
    updatedAt: NOW,
  });
  await db.insert(alertDefaultReminders).values({ userId, reminders: [reminder], updatedAt: NOW });
  await db.insert(alert).values({
    userId,
    eventId: kept.id,
    reminder: "h2",
    dueAt: NOW,
    deadlineAt: NOW,
    origin: "default",
    status: "pending",
  });
  await db.insert(pushSubscription).values({
    userId,
    endpoint: `https://push.example.com/${userId}`,
    p256dh: SECRET,
    auth: SECRET,
  });
  await db.insert(calendarFeed).values({
    userId,
    secretHash: `${SECRET}-${name}`,
    childIds: [childId],
    createdAt: NOW,
    rotatedAt: NOW,
    lastFetchedAt: NOW,
  });
  await db.insert(alertDigestPreference).values({ userId, enabled: false, updatedAt: NOW });
  await db
    .insert(alertQuietHours)
    .values({ userId, enabled: true, start: "22:00", end: "06:30", updatedAt: NOW });
  await db.insert(alertWeeklyDigest).values({
    userId,
    weekStart: "2030-03-04",
    expiresAt: NOW,
    status: "sent",
    channel: "push",
    sentAt: NOW,
  });
  await db.insert(seenAnnouncement).values({
    childId,
    announcementId: `announcement-${name}`,
    courseId: "course-1",
    outcome: "extracted",
    attempts: 1,
    seenAt: NOW,
  });

  return { userId, childId };
}

async function cleanup(): Promise<void> {
  const ids = (
    await db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(like(authSchema.user.id, `${probe}-%`))
  ).map((row) => row.id);
  if (ids.length > 0)
    await db
      .delete(outboxSchema.outboxEvent)
      .where(inArray(outboxSchema.outboxEvent.aggregateId, ids));
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
}

const { step, run } = stepRunner("check-data-export", cleanup);

run(async () => {
  const a = await family("a");
  const b = await family("b");

  const first = await service(NOW).requestExport({ userId: a.userId });
  await step("the first export succeeds", first.isSuccess, first.isFailure && first.getError());
  const { document, fileName } = first.getValue();
  const text = JSON.stringify(document);

  await step(
    "the file is named after the day",
    fileName === "classroom-parents-export-2030-03-10.json",
  );
  await step(
    "only the requesting parent's child and sync state are exported",
    document.children.length === 1 &&
      document.children[0]?.id === a.childId &&
      document.sync[0]?.announcementsSeen === 1 &&
      !text.includes(`${probe}-b`) &&
      !text.includes("Enfant b"),
    document.children,
  );
  await step(
    "each child carries its color and its Google picture",
    document.children[0]?.color === 5 && document.children[0]?.avatarUrl === `${AVATAR}a`,
    document.children,
  );
  await step(
    "withdrawn and deleted events are exported with their state",
    document.events.length === 4 &&
      document.events.some((e) => e.withdrawnAt !== null) &&
      document.events.some((e) => e.deletedAt !== null),
    document.events.map((e) => e.title),
  );
  await step(
    "a hand-added event is exported with no course nor Classroom link",
    document.events.some(
      (e) => e.source === "manual" && e.courseId === null && e.announcementUrl === null,
    ),
    document.events.map((e) => [e.source, e.courseId, e.announcementUrl]),
  );
  await step(
    "the calendar feed comes with its children and dates, never its secret",
    document.calendarFeed?.childIds?.[0] === a.childId &&
      document.calendarFeed.lastFetchedAt === NOW.toISOString() &&
      !text.includes(SECRET),
    document.calendarFeed,
  );
  await step(
    "the Sunday digest choice and the weeks it was sent come along",
    document.weeklyDigest.enabled === false &&
      document.weeklyDigest.chosenAt === NOW.toISOString() &&
      document.weeklyDigest.weeks[0]?.weekStart === "2030-03-04" &&
      document.weeklyDigest.weeks[0]?.status === "sent",
    document.weeklyDigest,
  );
  await step(
    "the quiet hours the parent chose come along",
    document.quietHours?.start === "22:00" &&
      document.quietHours.end === "06:30" &&
      document.quietHours.chosenAt === NOW.toISOString(),
    document.quietHours,
  );
  await step(
    "reminders, defaults and alerts come along",
    document.events.some((e) => e.reminders?.[0]?.hours === 2) &&
      document.defaultReminders?.[0]?.hours === 2 &&
      document.alerts.length === 1,
  );
  await step(
    "a push subscription shows its host only, and no token or key leaves the database",
    document.pushSubscriptions[0]?.endpointHost === "push.example.com" &&
      !text.includes(SECRET) &&
      !text.includes("/push.example.com/"),
    document.pushSubscriptions,
  );

  const second = await service(new Date(NOW.getTime() + 3_600_000)).requestExport({
    userId: a.userId,
  });
  await step(
    "a second export within 24 h is refused",
    second.isFailure && second.getError().code === "DATA_EXPORT_RATE_LIMITED",
  );

  const announced = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, a.userId),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.USER_DATA_EXPORT_REQUESTED),
      ),
    );
  await step("the export is announced once", announced.length === 1, announced);

  await db.delete(alertDigestPreference).where(eq(alertDigestPreference.userId, b.userId));
  const unchosen = await service(NOW).requestExport({ userId: b.userId });
  await step(
    "a parent who never chose gets the default digest choice",
    unchosen.isSuccess &&
      unchosen.getValue().document.weeklyDigest.enabled === true &&
      unchosen.getValue().document.weeklyDigest.chosenAt === null,
    unchosen.isSuccess && unchosen.getValue().document.weeklyDigest,
  );
}, "the export stays inside the parent's family and holds its 24 h limit on a real database");
