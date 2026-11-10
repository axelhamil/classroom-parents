/**
 * Proves against a real Postgres what mocked ports cannot: 4 dispatchers running at once over
 * 200 due alerts send each alert exactly once (FOR UPDATE SKIP LOCKED plus the lease), a family
 * never reads, sets or clears another family's alert nor deletes its push subscription, and the
 * claim query reads alert_pending_due_idx among thousands of settled alerts.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-alert-db", process.env.DATABASE_URL);

import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { childAccount } from "@modules/children/schemas/child.schema";
import { type AppError, Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  db,
  eq,
  inArray,
  isNull,
  like,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { alert } from "../schemas/alert.schema";
import { pushSubscription } from "../schemas/push-subscription.schema";
import { DISPATCH_BATCH, DISPATCH_LEASE_SECONDS } from "../src/application/config/dispatch-budget";
import type {
  AlertContext,
  IAlertContextReader,
} from "../src/application/ports/alert-context-reader.port";
import type { IAlertEmailSender } from "../src/application/ports/alert-email-sender.port";
import type { EventDeadline, IEventDeadlines } from "../src/application/ports/event-deadlines.port";
import type { IPushSender } from "../src/application/ports/push-sender.port";
import { AlertDispatchService } from "../src/application/services/alert-dispatch.service";
import { AlertPlanningService } from "../src/application/services/alert-planning.service";
import {
  alertClaimQuery,
  DrizzleAlertRepository,
} from "../src/infrastructure/repositories/drizzle-alert.repository";
import { DrizzlePushSubscriptionRepository } from "../src/infrastructure/repositories/drizzle-push-subscription.repository";

const DUE = 200;
const SETTLED = 5_000;
const WORKERS = 4;
const NOW = new Date();
const DAY_MS = 24 * 3600 * 1000;
const probe = `check-alert-db-${crypto.randomUUID()}`;
const { instrumentation } = spanRecorder();

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
};

const deadlines: IEventDeadlines = {
  forUser: async (userId, eventId) => {
    const [row] = await db
      .select({ deadlineAt: agendaEvent.deadlineAt, deadlineDate: agendaEvent.deadlineDate })
      .from(agendaEvent)
      .where(
        and(
          eq(agendaEvent.id, eventId),
          eq(agendaEvent.userId, userId),
          isNull(agendaEvent.deletedAt),
          isNull(agendaEvent.withdrawnAt),
        ),
      );
    return Result.ok<Option<EventDeadline>, AppError>(Option.fromNullable(row));
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
const alerts = new DrizzleAlertRepository(instrumentation);
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
const planning = new AlertPlanningService(alerts, deadlines, transactions, outbox, instrumentation);

async function seedFamily(name: string): Promise<{ userId: string; childId: string }> {
  const userId = `${probe}-${name}`;
  await db.insert(authSchema.user).values({ id: userId, name, email: `${userId}@example.com` });
  await db.insert(authSchema.account).values({
    id: `${userId}-account`,
    accountId: `sub-${userId}`,
    providerId: "google-classroom",
    userId,
    updatedAt: NOW,
  });
  const inserted = await db
    .insert(childAccount)
    .values({
      userId,
      linkedAccountId: `${userId}-account`,
      googleEmail: `${name}-child@school.example`,
      label: `${name} child`,
      status: "connected",
      connectedAt: NOW,
      nextSyncAt: NOW,
    })
    .returning({ id: childAccount.id });
  const childId = inserted[0]?.id;
  if (!childId) throw new Error(`child of ${name} not created`);

  return { userId, childId };
}

async function seedAlerts(
  family: { userId: string; childId: string },
  count: number,
  status: "pending" | "sent",
  label: string = status,
): Promise<string[]> {
  const deadlineAt = new Date(NOW.getTime() + 5 * DAY_MS);
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
          deadlineDate: deadlineAt.toISOString().slice(0, 10),
          deadlineAt,
          receivedAt: NOW,
          status: "confirmed" as const,
        })),
      )
      .returning({ id: agendaEvent.id });
    const rows = await db
      .insert(alert)
      .values(
        events.map(({ id }, i) => ({
          eventId: id,
          userId: family.userId,
          dueAt: new Date(NOW.getTime() - 60_000 - (offset + i) * 1000),
          deadlineAt,
          origin: "default" as const,
          status,
          sentAt: status === "sent" ? NOW : null,
        })),
      )
      .returning({ eventId: alert.eventId });
    ids.push(...rows.map(({ eventId }) => eventId));
  }
  return ids;
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
  await seedAlerts(a, SETTLED, "sent");
  const dueEvents = await seedAlerts(b, DUE, "pending");
  for (const family of [a, b]) {
    const stored = await subscriptions.upsert({
      userId: family.userId,
      endpoint: `https://push.example.com/${family.userId}`,
      p256dh: "p256dh",
      auth: "auth",
      userAgent: Option.none(),
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
    if (claimed === 0 || rounds > 10) break;
  }
  const elapsed = Math.round(performance.now() - started);
  console.log(
    `\n${WORKERS} dispatchers drained ${DUE} alerts in ${elapsed} ms (${rounds} rounds)\n`,
  );

  const sentRows = await db
    .select({ id: alert.id, status: alert.status })
    .from(alert)
    .where(inArray(alert.eventId, dueEvents));
  await step(
    `the ${DUE} due alerts are all sent`,
    sentRows.length === DUE && sentRows.every((row) => row.status === "sent"),
  );
  await step(
    "each alert was pushed exactly once",
    pushes.size === DUE && [...pushes.values()].every((count) => count === 1),
    { distinct: pushes.size, max: Math.max(...pushes.values()) },
  );
  await step("no email fallback while a push got through", emails === 0, { emails });

  const [racedEvent] = await seedAlerts(b, 1, "pending", "raced");
  if (!racedEvent) throw new Error("raced alert not seeded");
  await db.update(alert).set({ origin: "user" }).where(eq(alert.eventId, racedEvent));
  let racedPushes = 0;
  const racingPush: IPushSender = {
    send: async () => {
      racedPushes += 1;
      if (racedPushes > 1) return Result.ok();

      const later = new Date(NOW.getTime() + 6 * DAY_MS);
      await db
        .update(agendaEvent)
        .set({ deadlineAt: later, deadlineDate: later.toISOString().slice(0, 10) })
        .where(eq(agendaEvent.id, racedEvent));
      const replanned = await planning.replan({
        eventId: racedEvent,
        userId: b.userId,
        actorUserId: null,
      });
      if (replanned.isFailure) throw new Error(replanned.getError().code);
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
  const [raced] = await db.select().from(alert).where(eq(alert.eventId, racedEvent));
  await step(
    "the deadline moving while an alert is being sent sends it once",
    racedPushes === 1 && raced?.status === "sent",
    { pushes: racedPushes, status: raced?.status, attempts: raced?.attempts },
  );

  const eventOfB = dueEvents[0] ?? "";
  const [before] = await db.select().from(alert).where(eq(alert.eventId, eventOfB));
  const read = await planning.get(a.userId, eventOfB);
  await step("A cannot read B's alert", codeOf(read) === "ALERT_NOT_FOUND", codeOf(read));
  const set = await planning.setUserAlert(a.userId, eventOfB, {
    date: new Date(NOW.getTime() + DAY_MS).toISOString().slice(0, 10),
    time: "07:30",
  });
  await step("A cannot set B's alert", codeOf(set) === "ALERT_NOT_FOUND", codeOf(set));
  const cleared = await planning.clear(a.userId, eventOfB);
  await step("A cannot clear B's alert", codeOf(cleared) === "ALERT_NOT_FOUND", codeOf(cleared));
  const owned = await alerts.findOwned(a.userId, eventOfB);
  await step(
    "the repository reads B's alert as absent for A",
    owned.isSuccess && owned.getValue().isNone(),
  );
  const [after] = await db.select().from(alert).where(eq(alert.eventId, eventOfB));
  await step(
    "B's alert row is untouched",
    JSON.stringify(before) === JSON.stringify(after) && before !== undefined,
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
}, "alerts are sent once under concurrency and stay inside their family on a real database");
