/**
 * Proves against a real Postgres what mocked ports cannot: 4 dispatchers running at once over
 * 200 due events of 2 reminders each send each reminder exactly once (FOR UPDATE SKIP LOCKED plus
 * the lease), 4 planners racing on one event write each reminder once, changing the defaults
 * replans only the events that follow them, a family never reads, sets or resets another family's
 * reminders nor deletes its push subscription, the claim query reads alert_pending_due_idx among
 * thousands of settled alerts, the reminders migration turns legacy alerts into reminders, and a
 * phone shared by two parents belongs to the last one who subscribed it: A's alerts stop reaching it,
 * and revoking a device's session removes that device's push alerts while an expired session keeps them.
 * The dispatchers claim only the alerts of the parents this run creates, so another writer on the
 * same database (a demo seed, a second run) neither fails the counts nor gets its alerts sent.
 */

import { isDeepStrictEqual } from "node:util";
import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-alert-db", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import { shiftInstant } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall, zonedWallTimeToUtc } from "@packages/ddd-kit/zoned-time";
import {
  and,
  authSchema,
  db,
  eq,
  gte,
  inArray,
  isNull,
  like,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { alert } from "../schemas/alert.schema";
import { pushSubscription } from "../schemas/push-subscription.schema";
import { alertEventReminders } from "../schemas/reminder-settings.schema";
import { DISPATCH_BATCH, DISPATCH_LEASE_SECONDS } from "../src/application/config/dispatch-budget";
import type {
  AlertContext,
  IAlertContextReader,
} from "../src/application/ports/alert-context-reader.port";
import type { IAlertEmailSender } from "../src/application/ports/alert-email-sender.port";
import type {
  EventDeadline,
  IEventDeadlines,
  UpcomingDeadline,
} from "../src/application/ports/event-deadlines.port";
import type { IPushSender } from "../src/application/ports/push-sender.port";
import { AlertDispatchService } from "../src/application/services/alert-dispatch.service";
import { AlertPlanningService } from "../src/application/services/alert-planning.service";
import { PushSubscriptionService } from "../src/application/services/push-subscription.service";
import { ReminderSettingsService } from "../src/application/services/reminder-settings.service";
import { ReminderList } from "../src/domain/value-objects/reminder-list.vo";
import {
  alertClaimQuery,
  DrizzleAlertRepository,
} from "../src/infrastructure/repositories/drizzle-alert.repository";
import { DrizzlePushSubscriptionRepository } from "../src/infrastructure/repositories/drizzle-push-subscription.repository";
import { DrizzleReminderSettingsRepository } from "../src/infrastructure/repositories/drizzle-reminder-settings.repository";
import { probeReminderMigration } from "./reminder-migration-probe";

const DUE = 200;
const SETTLED = 5_000;
const WORKERS = 4;
const NOW = new Date();
const probe = `check-alert-db-${crypto.randomUUID()}`;
const { instrumentation, spans } = spanRecorder();

const pushes = new Map<string, number>();
const pushSender: IPushSender = {
  send: async (_target, _payload, options) => {
    pushes.set(options.topic, (pushes.get(options.topic) ?? 0) + 1);
    return Result.ok();
  },
};
let emails = 0;
const emailSender: IAlertEmailSender = {
  send: async () => {
    emails += 1;
    return Result.ok<AppError>();
  },
  sendDigest: async () => Result.ok<AppError>(),
};

const alive = (userId: string) =>
  and(
    eq(agendaEvent.userId, userId),
    isNull(agendaEvent.deletedAt),
    isNull(agendaEvent.withdrawnAt),
  );

const deadlines: IEventDeadlines = {
  forUser: async (userId, eventId) => {
    const [row] = await db
      .select({
        deadlineAt: agendaEvent.deadlineAt,
        deadlineDate: agendaEvent.deadlineDate,
        deadlineTime: agendaEvent.deadlineTime,
        done: agendaEvent.done,
        needsReview: sql<boolean>`${agendaEvent.status} = 'needs_review'`,
      })
      .from(agendaEvent)
      .where(and(eq(agendaEvent.id, eventId), alive(userId)));
    return Result.ok<Option<EventDeadline>, AppError>(
      Option.fromNullable(row).map(({ deadlineTime, ...deadline }) => ({
        ...deadline,
        deadlineTime: deadlineTime?.slice(0, 5),
      })),
    );
  },
  upcomingFor: async (userId, now) => {
    const rows = await db
      .select({
        eventId: agendaEvent.id,
        deadlineAt: agendaEvent.deadlineAt,
        deadlineDate: agendaEvent.deadlineDate,
        deadlineTime: agendaEvent.deadlineTime,
        done: agendaEvent.done,
        needsReview: sql<boolean>`${agendaEvent.status} = 'needs_review'`,
      })
      .from(agendaEvent)
      .where(and(alive(userId), gte(agendaEvent.deadlineAt, now), eq(agendaEvent.done, false)));
    return Result.ok<UpcomingDeadline[], AppError>(
      rows.map(({ deadlineTime, ...deadline }) => ({
        ...deadline,
        deadlineTime: deadlineTime?.slice(0, 5),
      })),
    );
  },
};

const contexts: IAlertContextReader = {
  load: async (alertIds) =>
    Result.ok<AlertContext[], AppError>(
      alertIds.map((alertId) => ({
        alertId,
        email: `${probe}@example.com`,
        eventTitle: "Contrôle",
        childLabel: "Mia",
        deadlineLabel: "lundi",
        eventUrl: "https://app.example/events/x",
      })),
    ),
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-alert-db" });
});
const alerts = new DrizzleAlertRepository(instrumentation, like(alert.userId, `${probe}-%`));
const subscriptions = new DrizzlePushSubscriptionRepository(instrumentation);
const dispatch = new AlertDispatchService(
  alerts,
  subscriptions,
  pushSender,
  emailSender,
  contexts,
  deadlines,
  transactions,
  outbox,
  instrumentation,
);
const reminderSettings = new DrizzleReminderSettingsRepository(instrumentation);
const planning = new AlertPlanningService(
  alerts,
  reminderSettings,
  deadlines,
  transactions,
  outbox,
  instrumentation,
);
const settings = new ReminderSettingsService(
  reminderSettings,
  alerts,
  deadlines,
  planning,
  transactions,
  outbox,
  instrumentation,
);
const pushService = new PushSubscriptionService(
  subscriptions,
  transactions,
  outbox,
  instrumentation,
);

async function seedFamily(name: string): Promise<{ userId: string; childId: string }> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({ userId, name, at: NOW, label: `${name} child` });

  return { userId, childId };
}

async function seedEvents(
  family: { userId: string; childId: string },
  count: number,
  label: string,
  deadlineAt: Date,
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < count; offset += 1000) {
    const size = Math.min(1000, count - offset);
    const events = await db
      .insert(agendaEvent)
      .values(
        Array.from({ length: size }, (_, i) => ({
          userId: family.userId,
          childId: family.childId,
          announcementId: `${label}-${offset + i}`,
          ordinal: 0,
          courseId: "course-alert",
          announcementUrl: "https://classroom.google.com/c/alert",
          title: `Alert ${offset + i}`,
          description: "",
          category: "homework" as const,
          deadlineDate: parisDay(deadlineAt),
          deadlineAt,
          receivedAt: NOW,
          status: "confirmed" as const,
        })),
      )
      .returning({ id: agendaEvent.id });
    ids.push(...events.map(({ id }) => id));
  }
  return ids;
}

async function seedAlerts(
  family: { userId: string; childId: string },
  count: number,
  status: "pending" | "sent",
  reminders: string[],
  label: string = status,
): Promise<string[]> {
  const deadlineAt = shiftInstant(NOW, 5);
  const ids = await seedEvents(family, count, label, deadlineAt);
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const slice = ids.slice(offset, offset + 1000);
    await db.insert(alert).values(
      slice.flatMap((eventId, i) =>
        reminders.map((reminder, r) => ({
          eventId,
          userId: family.userId,
          reminder,
          dueAt: new Date(NOW.getTime() - 60_000 - (offset + i) * 1000 - r * 500),
          deadlineAt,
          origin: "default" as const,
          status,
          sentAt: status === "sent" ? NOW : null,
        })),
      ),
    );
  }
  return ids;
}

function parisDay(at: Date): string {
  return utcToZonedWall(at, PARIS_TIME_ZONE)
    .map((wall) => wall.date)
    .unwrapOr("");
}

function paris(date: string, time: string): Date {
  return zonedWallTimeToUtc(date, time, PARIS_TIME_ZONE).unwrapOr(new Date(Number.NaN));
}

async function scheduledFor(eventId: string): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.eventType, "alert.alert.scheduled"),
        sql`${outboxSchema.outboxEvent.payload}->>'eventId' = ${eventId}`,
      ),
    );
  return rows.length;
}

async function alertsOn(eventId: string) {
  return db.select().from(alert).where(eq(alert.eventId, eventId)).orderBy(alert.reminder);
}

async function explainClaim(): Promise<string> {
  const { sql, params } = alertClaimQuery(db, NOW, DISPATCH_BATCH, DISPATCH_LEASE_SECONDS).toSQL();
  const client = await db.$client.connect();
  try {
    await client.query("BEGIN");
    const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`, params);
    return plan.rows.map((row: Record<string, string>) => Object.values(row).join("")).join("\n");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function cleanup(): Promise<void> {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
}

const codeOf = (result: Result<unknown, AppError>) =>
  result.isFailure ? result.getError().code : "ok";

const { step, run } = stepRunner("check-alert-db", cleanup);

run(async () => {
  const a = await seedFamily("a");
  const b = await seedFamily("b");
  const c = await seedFamily("c");
  await seedAlerts(a, SETTLED, "sent", ["d2@18:00"]);
  const dueEvents = await seedAlerts(b, DUE, "pending", ["d2@18:00", "d1@18:00"]);
  for (const family of [a, b]) {
    const stored = await subscriptions.upsert({
      userId: family.userId,
      endpoint: `https://push.example.com/${family.userId}`,
      p256dh: "p256dh",
      auth: "auth",
      userAgent: Option.none(),
      sessionId: Option.none(),
      now: NOW,
    });
    await step(`subscription of ${family.userId} stored`, stored.isSuccess);
  }
  await db.$client.query("ANALYZE alert");

  const plan = await explainClaim();
  console.log(`\nEXPLAIN ANALYZE claim query (rolled back):\n${plan}\n`);
  await step("the claim query reads alert_pending_due_idx", plan.includes("alert_pending_due_idx"));

  const started = performance.now();
  let rounds = 0;
  for (;;) {
    rounds += 1;
    const outcomes = await Promise.all(
      Array.from({ length: WORKERS }, () => dispatch.runOnce(NOW)),
    );
    await step(
      `round ${rounds}: every dispatcher succeeded`,
      outcomes.every((outcome) => outcome.isSuccess),
    );
    const claimed = outcomes.reduce(
      (total, outcome) => total + (outcome.isSuccess ? outcome.getValue().claimed : 0),
      0,
    );
    if (claimed === 0 || rounds > 20) break;
  }
  const elapsed = Math.round(performance.now() - started);
  const dueReminders = DUE * 2;
  console.log(
    `\n${WORKERS} dispatchers drained ${dueReminders} reminders of ${DUE} events in ${elapsed} ms (${rounds} rounds)\n`,
  );

  const sentRows = await db
    .select({ id: alert.id, status: alert.status })
    .from(alert)
    .where(inArray(alert.eventId, dueEvents));
  await step(
    `the ${dueReminders} due reminders are all sent`,
    sentRows.length === dueReminders && sentRows.every((row) => row.status === "sent"),
  );
  await step(
    "each reminder was pushed exactly once, each with its own topic",
    pushes.size === dueReminders && [...pushes.values()].every((count) => count === 1),
    { distinct: pushes.size, max: Math.max(...pushes.values()) },
  );
  await step("no email fallback while a push got through", emails === 0, { emails });

  const dueAt = new Date(Math.floor((NOW.getTime() - 60_000) / 60_000) * 60_000);
  const dueWall = utcToZonedWall(dueAt, PARIS_TIME_ZONE).unwrapOr({ date: "", time: "" });
  const racedDeadline = paris(dueWall.date, "23:59");
  const [racedEvent] = await seedEvents(b, 1, "raced", racedDeadline);
  if (!racedEvent) throw new Error("raced event not seeded");
  const racedKey = `d0@${dueWall.time}`;
  await db.insert(alertEventReminders).values({
    eventId: racedEvent,
    userId: b.userId,
    reminders: [{ kind: "days_before", days: 0, time: dueWall.time }],
    updatedAt: NOW,
  });
  await db.insert(alert).values({
    eventId: racedEvent,
    userId: b.userId,
    reminder: racedKey,
    dueAt,
    deadlineAt: racedDeadline,
    origin: "user",
    status: "pending",
  });
  let racedPushes = 0;
  const racingPush: IPushSender = {
    send: async () => {
      racedPushes += 1;
      if (racedPushes > 1) return Result.ok();

      const customized = await settings.customizeEvent(b.userId, racedEvent, [
        { kind: "days_before", days: 0, time: dueWall.time },
        { kind: "days_before", days: 1, time: "18:00" },
      ]);
      if (customized.isFailure) throw new Error(customized.getError().code);
      return Result.ok();
    },
  };
  const racing = new AlertDispatchService(
    alerts,
    subscriptions,
    racingPush,
    emailSender,
    contexts,
    deadlines,
    transactions,
    outbox,
    instrumentation,
  );
  await racing.runOnce(NOW);
  await racing.runOnce(NOW);
  const raced = (await alertsOn(racedEvent)).find((row) => row.reminder === racedKey);
  await step(
    "the parent editing the reminders while one is being sent sends it once",
    racedPushes === 1 && raced?.status === "sent",
    { pushes: racedPushes, status: raced?.status, attempts: raced?.attempts },
  );

  const deadlineOfC = shiftInstant(NOW, 6);
  const [followingDefaults, ownReminders] = await seedEvents(c, 2, "planned", deadlineOfC);
  if (!followingDefaults || !ownReminders) throw new Error("events of c not seeded");
  const setTwo = await settings.setDefaults(c.userId, [
    { kind: "days_before", days: 2, time: "18:00" },
    { kind: "days_before", days: 1, time: "07:30" },
  ]);
  await step("c sets two default reminders", setTwo.isSuccess, codeOf(setTwo));
  await db.delete(alert).where(eq(alert.eventId, followingDefaults));
  const scheduledBefore = await scheduledFor(followingDefaults);
  const racers = await Promise.all(
    Array.from({ length: WORKERS }, () =>
      planning.planDefault({ eventId: followingDefaults, userId: c.userId, actorUserId: null }),
    ),
  );
  const planned = await alertsOn(followingDefaults);
  const scheduled = (await scheduledFor(followingDefaults)) - scheduledBefore;
  await step(
    `${WORKERS} planners racing on one event write each default reminder once`,
    racers.every((result) => result.isSuccess) &&
      planned.map(({ reminder }) => reminder).join(",") === "d1@07:30,d2@18:00" &&
      planned.every(({ status, version }) => status === "pending" && version === 1) &&
      scheduled === 2,
    { rows: planned.map(({ reminder, version }) => `${reminder}#${version}`), scheduled },
  );

  const custom = await settings.customizeEvent(c.userId, ownReminders, [
    { kind: "days_before", days: 3, time: "20:00" },
  ]);
  await step("c customizes one event", custom.isSuccess, codeOf(custom));
  const [firstDefault] = planned;
  if (!firstDefault) throw new Error("no planned reminder of c");
  await db.update(alert).set({ status: "sent", sentAt: NOW }).where(eq(alert.id, firstDefault.id));
  const changed = await settings.setDefaults(c.userId, [
    { kind: "days_before", days: 4, time: "18:00" },
  ]);
  const afterDefaults = await alertsOn(followingDefaults);
  const afterCustom = await alertsOn(ownReminders);
  await step(
    "new defaults replan the event that follows them, never the customized one nor a reminder already sent",
    changed.isSuccess &&
      afterDefaults.map((row) => `${row.reminder}:${row.status}`).join(",") ===
        "d1@07:30:sent,d2@18:00:skipped,d4@18:00:pending" &&
      afterCustom.map((row) => `${row.reminder}:${row.status}`).join(",") ===
        "d1@07:30:skipped,d2@18:00:skipped,d3@20:00:pending",
    {
      followingDefaults: afterDefaults.map((row) => `${row.reminder}:${row.status}`),
      customized: afterCustom.map((row) => `${row.reminder}:${row.status}`),
    },
  );

  const d = await seedFamily("d");
  const fewEvents = await seedEvents(d, 2, "few", deadlineOfC);
  const fewQueriesFrom = spans.length;
  const onFew = await settings.setDefaults(d.userId, [
    { kind: "days_before", days: 2, time: "18:00" },
  ]);
  const queriesOnFew = spans.length - fewQueriesFrom;
  const manyEvents = await seedEvents(d, 40, "many", deadlineOfC);
  const manyQueriesFrom = spans.length;
  const onMany = await settings.setDefaults(d.userId, [
    { kind: "days_before", days: 2, time: "18:00" },
    { kind: "days_before", days: 1, time: "07:30" },
  ]);
  const queriesOnMany = spans.length - manyQueriesFrom;
  const plannedOfD = await db
    .select({ reminder: alert.reminder, status: alert.status })
    .from(alert)
    .where(eq(alert.userId, d.userId));
  await step(
    "new defaults replan every upcoming event of the parent with the same number of queries whether they have 2 or 42 events",
    onFew.isSuccess &&
      onMany.isSuccess &&
      queriesOnMany === queriesOnFew &&
      plannedOfD.length === 2 * (fewEvents.length + manyEvents.length) &&
      plannedOfD.every(({ status }) => status === "pending"),
    { queriesOnFew, queriesOnMany, alerts: plannedOfD.length },
  );

  const eventOfB = dueEvents[0] ?? "";
  const before = await alertsOn(eventOfB);
  const read = await settings.eventReminders(a.userId, eventOfB);
  await step("A cannot read B's reminders", codeOf(read) === "ALERT_NOT_FOUND", codeOf(read));
  const set = await settings.customizeEvent(a.userId, eventOfB, [
    { kind: "days_before", days: 1, time: "07:30" },
  ]);
  await step("A cannot set B's reminders", codeOf(set) === "ALERT_NOT_FOUND", codeOf(set));
  const reset = await settings.resetEvent(a.userId, eventOfB);
  await step("A cannot reset B's reminders", codeOf(reset) === "ALERT_NOT_FOUND", codeOf(reset));
  const forged = await reminderSettings.saveEventPlan(
    a.userId,
    racedEvent,
    ReminderList.defaults(),
    NOW,
  );
  await step(
    "the repository refuses to overwrite B's event reminders for A",
    codeOf(forged) === "ALERT_NOT_FOUND",
    codeOf(forged),
  );
  const owned = await alerts.listOwned(a.userId, eventOfB);
  const plansOfB = await reminderSettings.eventPlanFor(a.userId, racedEvent);
  await step(
    "the repositories read B's reminders as absent for A",
    owned.isSuccess &&
      owned.getValue().length === 0 &&
      plansOfB.isSuccess &&
      plansOfB.getValue().isNone(),
  );
  const after = await alertsOn(eventOfB);
  await step(
    "B's reminder rows are untouched",
    JSON.stringify(before) === JSON.stringify(after) && before.length === 2,
  );

  const removed = await subscriptions.deleteOwned(a.userId, `https://push.example.com/${b.userId}`);
  const left = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, b.userId));
  await step(
    "A cannot delete B's push subscription",
    removed.isSuccess && removed.getValue().isNone() && left.length === 1,
  );

  await subscriptions.deleteOwned(a.userId, `https://push.example.com/${a.userId}`);
  const sharedPhone = `https://fcm.googleapis.com/fcm/send/${probe}`;
  const phoneKeys = {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  };
  const subscribedByA = await pushService.subscribe(a.userId, {
    endpoint: sharedPhone,
    keys: phoneKeys,
  });
  const reclaimed = await pushService.subscribe(b.userId, {
    endpoint: sharedPhone,
    keys: phoneKeys,
  });
  const owners = await db
    .select({ id: pushSubscription.id, userId: pushSubscription.userId })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, sharedPhone));
  await step(
    "B subscribing A's phone moves the endpoint to B",
    subscribedByA.isSuccess &&
      reclaimed.isSuccess &&
      owners.length === 1 &&
      owners[0]?.userId === b.userId,
    owners,
  );
  const phoneId = owners[0]?.id ?? "";
  const unsubscribedEvents = await db
    .select({ payload: outboxSchema.outboxEvent.payload })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.aggregateId, phoneId),
        eq(outboxSchema.outboxEvent.eventType, EventTypes.PUSH_UNSUBSCRIBED),
      ),
    );
  await step(
    "A's audit trail records the phone left them, with B as the actor",
    unsubscribedEvents.length === 1 &&
      isDeepStrictEqual(unsubscribedEvents[0]?.payload, {
        userId: a.userId,
        subscriptionId: phoneId,
        actorUserId: b.userId,
      }),
    unsubscribedEvents,
  );
  await db
    .delete(outboxSchema.outboxEvent)
    .where(eq(outboxSchema.outboxEvent.aggregateId, phoneId));

  const reachedEndpoints: string[] = [];
  const recordingPush: IPushSender = {
    send: async (target) => {
      reachedEndpoints.push(target.endpoint);
      return Result.ok();
    },
  };
  const afterReclaim = new AlertDispatchService(
    alerts,
    subscriptions,
    recordingPush,
    emailSender,
    contexts,
    deadlines,
    transactions,
    outbox,
    instrumentation,
  );
  const emailsBefore = emails;
  const [eventOfA] = await seedAlerts(a, 1, "pending", ["d2@18:00"], "shared-phone");
  if (!eventOfA) throw new Error("alert of A not seeded");
  await afterReclaim.runOnce(NOW);
  const [alertOfA] = await db.select().from(alert).where(eq(alert.eventId, eventOfA));
  await step(
    "A's next alert no longer reaches the phone B took over and goes by email",
    !reachedEndpoints.includes(sharedPhone) &&
      emails === emailsBefore + 1 &&
      alertOfA?.status === "sent",
    { reachedEndpoints, emails: emails - emailsBefore, status: alertOfA?.status },
  );

  const legacyDeadline = paris("2026-12-10", "08:30");
  const [legacyDefault, legacyOwn, legacyFar, legacyLate] = await seedEvents(
    a,
    4,
    "legacy",
    legacyDeadline,
  );
  if (!legacyDefault || !legacyOwn || !legacyFar || !legacyLate)
    throw new Error("legacy events not seeded");
  const migrated = await probeReminderMigration([
    {
      eventId: legacyDefault,
      userId: a.userId,
      dueAt: paris("2026-12-08", "18:00"),
      deadlineAt: legacyDeadline,
      origin: "default",
      status: "pending",
    },
    {
      eventId: legacyOwn,
      userId: a.userId,
      dueAt: paris("2026-12-09", "07:15"),
      deadlineAt: legacyDeadline,
      origin: "user",
      status: "sent",
    },
    {
      eventId: legacyFar,
      userId: a.userId,
      dueAt: paris("2026-11-20", "07:30"),
      deadlineAt: legacyDeadline,
      origin: "user",
      status: "pending",
    },
    {
      eventId: legacyLate,
      userId: a.userId,
      dueAt: paris("2026-12-10", "19:00"),
      deadlineAt: legacyDeadline,
      origin: "user",
      status: "skipped",
    },
  ]);
  const migratedRow = (eventId: string) => migrated.alerts.find((row) => row.eventId === eventId);
  const rowOf = (eventId: string) => {
    const row = migratedRow(eventId);
    return row === undefined
      ? "none"
      : `${row.reminder}:${row.origin}:${row.status}:${row.dueAt.toISOString()}:v${row.version}`;
  };
  const planOf = (eventId: string) =>
    JSON.stringify(migrated.plans.find((plan) => plan.eventId === eventId)?.reminders ?? null);
  await step(
    "the reminders migration turns the default alert into the default reminder and the parent's offset into a list of one reminder",
    migrated.readable &&
      rowOf(legacyDefault) ===
        `d2@18:00:default:pending:${paris("2026-12-08", "18:00").toISOString()}:v1` &&
      rowOf(legacyOwn) === `d1@07:15:user:sent:${paris("2026-12-09", "07:15").toISOString()}:v1` &&
      planOf(legacyDefault) === "null" &&
      planOf(legacyOwn) === JSON.stringify([{ days: 1, kind: "days_before", time: "07:15" }]),
    migrated,
  );
  await step(
    "the reminders migration brings a parent's alert beyond J-14 to J-14 at its time, as a new occurrence, in the migration itself",
    rowOf(legacyFar) ===
      `d14@07:30:user:pending:${paris("2026-11-26", "07:30").toISOString()}:v2` &&
      planOf(legacyFar) === JSON.stringify([{ days: 14, kind: "days_before", time: "07:30" }]),
    migrated,
  );
  await step(
    "the reminders migration puts back on the defaults an event whose parent alert rang after its deadline",
    rowOf(legacyLate) ===
      `d2@18:00:default:skipped:${paris("2026-12-08", "18:00").toISOString()}:v1` &&
      planOf(legacyLate) === "null" &&
      migrated.plans.length === 2,
    migrated,
  );

  const phoneSession = `${c.userId}-phone`;
  const laptopSession = `${c.userId}-laptop`;
  await db.insert(authSchema.session).values(
    [phoneSession, laptopSession].map((id) => ({
      id,
      token: `${id}-token`,
      userId: c.userId,
      expiresAt: NOW,
      updatedAt: NOW,
    })),
  );
  const deviceKeys = {
    p256dh:
      "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  };
  const phoneEndpoint = `https://fcm.googleapis.com/fcm/send/${probe}-phone`;
  const laptopEndpoint = `https://fcm.googleapis.com/fcm/send/${probe}-laptop`;
  await pushService.subscribe(c.userId, {
    endpoint: phoneEndpoint,
    keys: deviceKeys,
    sessionId: phoneSession,
  });
  await pushService.subscribe(c.userId, {
    endpoint: laptopEndpoint,
    keys: deviceKeys,
    sessionId: laptopSession,
  });
  const endpointsOfC = async () =>
    (
      await db
        .select({ endpoint: pushSubscription.endpoint })
        .from(pushSubscription)
        .where(eq(pushSubscription.userId, c.userId))
    )
      .map(({ endpoint }) => endpoint)
      .sort();

  await db.delete(authSchema.session).where(eq(authSchema.session.id, laptopSession));
  await step(
    "a session that expires keeps its device's push alerts",
    isDeepStrictEqual(await endpointsOfC(), [laptopEndpoint, phoneEndpoint].sort()),
    await endpointsOfC(),
  );

  const foreign = await pushService.forgetSession(a.userId, phoneSession);
  await step(
    "another parent cannot drop C's device by naming its session",
    foreign.isSuccess && (await endpointsOfC()).length === 2,
    await endpointsOfC(),
  );

  const forgotten = await pushService.forgetSession(c.userId, phoneSession);
  await step(
    "revoking the phone's session removes the phone's push alerts and keeps the laptop's",
    forgotten.isSuccess && isDeepStrictEqual(await endpointsOfC(), [laptopEndpoint]),
    await endpointsOfC(),
  );
}, "each reminder is sent and planned once and stays inside its family on a real database");
