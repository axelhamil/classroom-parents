/**
 * Proves against a real Postgres what the mocked ports of `data-export.service.test.ts` cannot:
 * the export reads only the requesting parent's rows (the owner filter lives in the host query),
 * keeps withdrawn, deleted and hand-added events, the child color and picture, the calendar feed
 * (never its secret), the Sunday digest choice and history, with the default choice for a
 * parent who never made one, the school calendar choice and own holiday periods, the language, region and AI opposition
 * choices, the AI usage counters, the AI call journal (no hash, no prompt), the home layout
 * and the home note (the requester's, never another parent's); each Classroom deadline carries its
 * course name read through the same port as the api, a hand-added one none; it never carries a
 * token or a push key, and the 24 h limit is held by the stored request date, so a second
 * request is refused and leaves one event.
 */

import { isDeepStrictEqual } from "node:util";
import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-data-export", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { alert } from "@modules/alerts/schemas/alert.schema";
import { pushLockScreen, pushSubscription } from "@modules/alerts/schemas/push-subscription.schema";
import {
  alertDefaultReminders,
  alertEventReminders,
  alertQuietHours,
} from "@modules/alerts/schemas/reminder-settings.schema";
import {
  alertDigestPreference,
  alertWeeklyDigest,
} from "@modules/alerts/schemas/weekly-digest.schema";
import { aiUsage, assistantPreference } from "@modules/assistant/schemas/assistant.schema";
import { calendarFeed } from "@modules/calendar-feed/schemas/calendar-feed.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { classroomCourse } from "@modules/classroom-sync/schemas/classroom-course.schema";
import { seenAnnouncement } from "@modules/classroom-sync/schemas/seen-announcement.schema";
import { homeLayout, homeNote } from "@modules/home/schemas/home.schema";
import { notification } from "@modules/notifications/schemas/notification.schema";
import {
  schoolCalendarChoice,
  schoolHolidayPeriod,
} from "@modules/school-calendar/schemas/school-calendar.schema";
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
import { aiCall } from "@packages/llm/schemas/ai-call.schema";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { di } from "../src/container";
import { DataExportService } from "../src/modules/rgpd/application/services/data-export.service";
import { DrizzleRgpdRepository } from "../src/modules/rgpd/infrastructure/repositories/drizzle-rgpd.repository";
import { UserDataQuery } from "../src/queries/user-data.query";
import { logger } from "../src/shared/logger";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";

const NOW = new Date("2030-03-10T09:00:00.000Z");
const SECRET = "probe-secret-token";
const HOME_BLOCKS = [{ id: "agenda", w: 8, h: 2, hidden: false }];
const AVATAR = "https://lh3.googleusercontent.com/a/probe-";
const probe = `check-data-export-${crypto.randomUUID()}`;
const instrumentation = new NoOpInstrumentation();
const service = (at: Date) =>
  new DataExportService(
    new DrizzleRgpdRepository(logger, instrumentation),
    new UserDataQuery(instrumentation),
    di.ICourseNames,
    new TransactionService(instrumentation),
    new DrizzleOutboxRepository(instrumentation, () => undefined),
    instrumentation,
    () => at,
  );

const EVIDENCE = {
  reviewReasons: ["weekday_mismatch" as const],
  evidenceQuote: "Devoir à rendre jeudi 12 mars",
  evidenceStart: 10,
  evidenceEnd: 39,
  evidenceBefore: "Bonjour [ENFANT]. ",
  evidenceAfter: ". Merci.",
  parentActions: [
    {
      kind: "pay" as const,
      label: "Régler la sortie",
      amountCents: 850,
      currency: "EUR" as const,
      quote: "un chèque de 8,50 €",
    },
  ],
  toBring: [{ item: "pique-nique", quote: "Prévoir un pique-nique" }],
};

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
        checklist: { done: [`bag-${state}`], removed: [], extra: [], written: true },
        ...(state === "kept" ? EVIDENCE : {}),
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
    .insert(schoolCalendarChoice)
    .values({ userId, country: "MA", region: null, schoolHolidays: "own", updatedAt: NOW });
  await db.insert(schoolHolidayPeriod).values({
    userId,
    name: "Aïd al-Fitr",
    startsOn: "2030-03-05",
    endsOn: "2030-03-06",
    origin: "manual",
    createdAt: NOW,
  });
  await db.insert(assistantPreference).values({
    userId,
    locale: "pt",
    timeZone: "Europe/Lisbon",
    country: "PT",
    extractionEnabled: name !== "a",
    updatedAt: NOW,
  });
  await db.insert(aiUsage).values({
    userId,
    month: "2030-03-01",
    feature: "document_reading",
    calls: name === "a" ? 4 : 9,
    escalations: 1,
    costMicroUsd: 7_000,
  });
  await db.insert(aiCall).values({
    userId,
    feature: "announcement_extraction",
    model: "claude-haiku-5-5",
    promptVersion: "check-1",
    inputHash: "a".repeat(64),
    inputTokens: name === "a" ? 1200 : 9,
    outputTokens: 80,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicroUsd: 1_400,
    outcome: "ok",
    latencyMs: 700,
  });
  await db.insert(homeLayout).values({ userId, blocks: HOME_BLOCKS, updatedAt: NOW });
  await db.insert(homeNote).values({ userId, body: `Piscine de ${name}`, updatedAt: NOW });
  await db.insert(notification).values({
    userId,
    ref: `access-loss:${name}`,
    kind: "access_lost",
    childId,
    params: {},
    createdAt: NOW,
    readAt: name === "a" ? null : NOW,
  });
  await db.insert(pushLockScreen).values({ userId, details: true, updatedAt: NOW });
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
  await db.insert(classroomCourse).values({
    childId,
    courseId: "course-1",
    name: `Mathématiques ${name}`,
    listedAt: NOW,
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
    "the quoted passage is exported with its bounds and the sentences around it",
    document.events.some(
      (e) =>
        e.evidenceQuote === EVIDENCE.evidenceQuote &&
        e.evidenceStart === EVIDENCE.evidenceStart &&
        e.evidenceEnd === EVIDENCE.evidenceEnd &&
        e.evidenceBefore === EVIDENCE.evidenceBefore &&
        e.evidenceAfter === EVIDENCE.evidenceAfter,
    ),
    document.events.map((e) => e.evidenceQuote),
  );
  await step(
    "what the parent has to pay, sign or bring is exported with its quotes",
    document.events.some(
      (e) =>
        isDeepStrictEqual(e.parentActions, EVIDENCE.parentActions) &&
        isDeepStrictEqual(e.toBring, EVIDENCE.toBring),
    ),
    document.events.map((e) => e.parentActions),
  );
  await step(
    "the preparation checklist is exported as the parent sees it, without bookkeeping",
    document.events.some(
      (e) =>
        JSON.stringify(e.checklist) ===
        JSON.stringify({ done: ["bag-kept"], removed: [], extra: [] }),
    ),
    document.events.map((e) => e.checklist),
  );
  await step(
    "a hand-added event is exported with no course nor Classroom link",
    document.events.some(
      (e) => e.source === "manual" && e.courseId === null && e.announcementUrl === null,
    ),
    document.events.map((e) => [e.source, e.courseId, e.announcementUrl]),
  );
  await step(
    "each Classroom deadline carries its course name, the hand-added one none",
    document.events
      .filter((e) => e.source !== "manual")
      .every((e) => e.course?.id === "course-1" && e.course.name === "Mathématiques a") &&
      document.events.some((e) => e.source === "manual" && e.course === null),
    document.events.map((e) => [e.source, e.course]),
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
    "the school calendar choice and the parent's own holiday periods come along",
    document.schoolCalendar?.country === "MA" &&
      document.schoolCalendar.schoolHolidays === "own" &&
      document.schoolCalendar.chosenAt === NOW.toISOString() &&
      document.schoolHolidayPeriods[0]?.name === "Aïd al-Fitr" &&
      document.schoolHolidayPeriods[0]?.addedAt === NOW.toISOString(),
    { calendar: document.schoolCalendar, periods: document.schoolHolidayPeriods },
  );
  await step(
    "the language, region and AI opposition choices and the family's AI usage come along, its own only",
    document.assistantPreferences?.locale === "pt" &&
      document.assistantPreferences.timeZone === "Europe/Lisbon" &&
      document.assistantPreferences.extractionEnabled === false &&
      document.aiUsage.length === 1 &&
      document.aiUsage[0]?.calls === 4 &&
      document.aiUsage[0]?.month === "2030-03-01",
    { preferences: document.assistantPreferences, usage: document.aiUsage },
  );
  await step(
    "the family's AI call journal comes along, its own calls only, with no hash nor prompt",
    document.aiCalls.length === 1 &&
      document.aiCalls[0]?.inputTokens === 1200 &&
      document.aiCalls[0]?.outcome === "ok" &&
      typeof document.aiCalls[0]?.at === "string" &&
      !JSON.stringify(document.aiCalls).includes("a".repeat(64)) &&
      !JSON.stringify(document.aiCalls).includes("check-1"),
    document.aiCalls,
  );
  await step(
    "the home layout comes along",
    isDeepStrictEqual(document.homeLayout?.blocks, HOME_BLOCKS) &&
      document.homeLayout?.chosenAt === NOW.toISOString(),
    document.homeLayout,
  );
  await step(
    "the home note of the requester comes along, never another parent's",
    document.homeNote?.body === "Piscine de a" && document.homeNote.writtenAt === NOW.toISOString(),
    document.homeNote,
  );
  await step(
    "the notification center comes along, its own notifications only, with their reading state",
    document.notifications.length === 1 &&
      document.notifications[0]?.kind === "access_lost" &&
      document.notifications[0]?.readAt === null &&
      document.notifications[0]?.childId === document.children[0]?.id,
    document.notifications,
  );
  await step(
    "the lock screen choice comes along",
    document.lockScreen.details && document.lockScreen.chosenAt === NOW.toISOString(),
    document.lockScreen,
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
