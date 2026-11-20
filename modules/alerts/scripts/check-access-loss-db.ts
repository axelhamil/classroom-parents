/**
 * Proves against a real Postgres what mocked ports cannot about the lost access warning: four
 * handlers racing on the losses of one child (a redelivered event, a cause switching from a revoked
 * token to a school block) open one warning, four dispatchers racing over the due warnings push each
 * exactly once, a later failed sync opens nothing while the warning stays open, a reconnection
 * closes it and the next loss warns again, a loss at night waits for the end of the quiet hours in
 * the parent's zone (Paris, Montreal), a
 * parent without push gets one queued email even when the warning is dispatched twice, a family
 * never closes another family's warning, a disconnected child takes its warning with it, and the
 * claim query reads alert_access_loss_pending_due_idx among thousands of settled warnings. The
 * dispatchers claim only the warnings of the parents this run creates.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-access-loss-db", process.env.DATABASE_URL);

import { childAccount } from "@modules/children/schemas/child.schema";
import { seedParentWithChild } from "@modules/children/schemas/testing/seed-child";
import { type ILogger, Option, Result } from "@packages/ddd-kit";
import { PARIS_TIME_ZONE } from "@packages/ddd-kit/zoned-time";
import {
  and,
  authSchema,
  db,
  emailSchema,
  eq,
  inArray,
  isNull,
  like,
  outboxSchema,
  sql,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import { QueuedEmailService } from "@packages/email/email.service";
import { EventTypes } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { alertAccessLoss } from "../schemas/access-loss.schema";
import { DISPATCH_BATCH, DISPATCH_LEASE_SECONDS } from "../src/application/config/dispatch-budget";
import type { IAccessLossContextReader } from "../src/application/ports/access-loss-context.port";
import type { IParentTimeZone } from "../src/application/ports/parent-time-zone.port";
import type { IPushSender } from "../src/application/ports/push-sender.port";
import { AccessLossAlertService } from "../src/application/services/access-loss-alert.service";
import { I18nPushCopy } from "../src/infrastructure/adapters/i18n-push.copy";
import { ResendAlertEmailSender } from "../src/infrastructure/adapters/resend-alert-email.sender";
import {
  accessLossClaimQuery,
  DrizzleAccessLossRepository,
} from "../src/infrastructure/repositories/drizzle-access-loss.repository";
import { DrizzlePushSubscriptionRepository } from "../src/infrastructure/repositories/drizzle-push-subscription.repository";
import { DrizzleReminderSettingsRepository } from "../src/infrastructure/repositories/drizzle-reminder-settings.repository";

const WORKERS = 4;
const DUE = 40;
const SETTLED = 5_000;
const NOW = new Date();
const probe = `check-access-loss-db-${crypto.randomUUID()}`;
const { instrumentation } = spanRecorder();

const silentLogger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const pushedTags: string[] = [];
const recordingPush: IPushSender = {
  send: async (_target, message) => {
    pushedTags.push(message.tag);
    return Result.ok();
  },
};

const stillLostReader: IAccessLossContextReader = {
  stillLost: async (userId, childId) => {
    const rows = await db
      .select({ email: authSchema.user.email, childLabel: childAccount.label })
      .from(childAccount)
      .innerJoin(authSchema.user, eq(authSchema.user.id, childAccount.userId))
      .where(
        and(
          eq(childAccount.id, childId),
          eq(childAccount.userId, userId),
          inArray(childAccount.status, ["needs_reconnect", "blocked_by_school"]),
        ),
      );
    return Result.ok(Option.fromNullable(rows[0]));
  },
};

const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-access-loss-db" });
});
const subscriptions = new DrizzlePushSubscriptionRepository(instrumentation);
const emailSender = new ResendAlertEmailSender(
  { batchSend: async () => ({ data: null, error: null }) },
  "alerts@example.com",
  instrumentation,
  silentLogger,
  new QueuedEmailService(new DrizzleEmailQueue(instrumentation, silentLogger), instrumentation),
);

const zoneOf = new Map<string, string>();
const timeZones: IParentTimeZone = { of: async (userId) => zoneOf.get(userId) ?? PARIS_TIME_ZONE };

function serviceFor(): AccessLossAlertService {
  return new AccessLossAlertService(
    new DrizzleAccessLossRepository(instrumentation, like(alertAccessLoss.userId, `${probe}-%`)),
    new DrizzleReminderSettingsRepository(instrumentation),
    timeZones,
    stillLostReader,
    subscriptions,
    recordingPush,
    emailSender,
    new I18nPushCopy(),
    transactions,
    outbox,
    instrumentation,
    "https://app.example.com",
  );
}

const service = serviceFor();

interface Family {
  userId: string;
  childId: string;
}

async function seedFamily(name: string, withPhone = true): Promise<Family> {
  const userId = `${probe}-${name}`;
  const childId = await seedParentWithChild({ userId, name, at: NOW, label: `${name} child` });
  await db
    .update(childAccount)
    .set({ status: "needs_reconnect", cause: "invalid_grant" })
    .where(eq(childAccount.id, childId));
  if (withPhone)
    await subscriptions.upsert({
      userId,
      endpoint: `https://push.example.com/${userId}`,
      p256dh: "p256dh",
      auth: "auth",
      userAgent: Option.none(),
      sessionId: Option.none(),
      now: NOW,
    });

  return { userId, childId };
}

function warningsOf({ childId }: Family) {
  return db.select().from(alertAccessLoss).where(eq(alertAccessLoss.childId, childId));
}

async function openWarnings(family: Family): Promise<number> {
  const rows = await db
    .select({ id: alertAccessLoss.id })
    .from(alertAccessLoss)
    .where(and(eq(alertAccessLoss.childId, family.childId), isNull(alertAccessLoss.closedAt)));
  return rows.length;
}

async function scheduledFor({ childId }: Family): Promise<number> {
  const rows = await db
    .select({ id: outboxSchema.outboxEvent.id })
    .from(outboxSchema.outboxEvent)
    .where(
      and(
        eq(outboxSchema.outboxEvent.eventType, EventTypes.ACCESS_LOSS_ALERT_SCHEDULED),
        sql`${outboxSchema.outboxEvent.payload}->>'childId' = ${childId}`,
      ),
    );
  return rows.length;
}

function pushesTo({ childId }: Family): number {
  return pushedTags.filter((tag) => tag === `access-${childId}`).length;
}

async function drainAll(): Promise<void> {
  const workers = Array.from({ length: WORKERS }, () => serviceFor());
  for (;;) {
    const rounds = await Promise.all(workers.map((worker) => worker.runOnce(NOW)));
    if (rounds.every((round) => round.isSuccess && round.getValue().claimed === 0)) return;
  }
}

async function explainClaim(): Promise<string> {
  const { sql: text, params } = accessLossClaimQuery(
    db,
    NOW,
    DISPATCH_BATCH,
    DISPATCH_LEASE_SECONDS,
  ).toSQL();
  const client = await db.$client.connect();
  try {
    await client.query("BEGIN");
    const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${text}`, params);
    return plan.rows.map((row: Record<string, string>) => Object.values(row).join("")).join("\n");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function seedSettled(family: Family): Promise<void> {
  const closedAt = new Date(NOW.getTime() - 3_600_000);
  for (let offset = 0; offset < SETTLED; offset += 1000)
    await db.insert(alertAccessLoss).values(
      Array.from({ length: Math.min(1000, SETTLED - offset) }, () => ({
        userId: family.userId,
        childId: family.childId,
        dueAt: closedAt,
        status: "sent" as const,
        channel: "push" as const,
        sentAt: closedAt,
        closedAt,
      })),
    );
}

async function cleanup(): Promise<void> {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
  await db
    .delete(emailSchema.emailMessage)
    .where(like(emailSchema.emailMessage.toAddress, `${probe}-%`));
}

const { step, run } = stepRunner("check-access-loss-db", cleanup);

run(async () => {
  const jade = await seedFamily("jade");
  await Promise.all(
    Array.from({ length: WORKERS }, () =>
      service.warn({ userId: jade.userId, childId: jade.childId }, NOW),
    ),
  );
  await step(
    "4 handlers racing on the losses of one child open one warning",
    (await openWarnings(jade)) === 1 && (await scheduledFor(jade)) === 1,
  );

  const crowd = await Promise.all(Array.from({ length: DUE }, (_, i) => seedFamily(`crowd-${i}`)));
  for (const family of crowd) await service.warn(family, NOW);
  await drainAll();
  await step(
    `${WORKERS} dispatchers push each of the ${DUE + 1} due warnings exactly once`,
    pushesTo(jade) === 1 && crowd.every((family) => pushesTo(family) === 1),
    { jade: pushesTo(jade), crowd: crowd.map(pushesTo).filter((count) => count !== 1) },
  );

  await service.warn(jade, NOW);
  await drainAll();
  await step(
    "a later failed sync while the warning is open warns nothing more",
    (await warningsOf(jade)).length === 1 && pushesTo(jade) === 1,
  );

  const intruder = await seedFamily("intruder");
  await service.rearm({ userId: intruder.userId, childId: jade.childId }, NOW);
  await step(
    "another family never closes the warning of a child",
    (await openWarnings(jade)) === 1,
  );

  await service.rearm(jade, NOW);
  await step("a reconnection closes the warning", (await openWarnings(jade)) === 0);

  await service.warn(jade, NOW);
  await drainAll();
  await step(
    "after a reconnection, the next loss warns again, once",
    (await warningsOf(jade)).length === 2 && pushesTo(jade) === 2,
  );

  const night = await seedFamily("night");
  const lateEvening = new Date("2026-11-19T22:30:00Z");
  await service.warn(night, lateEvening);
  const [nightWarning] = await warningsOf(night);
  await step(
    "a loss at 23:30 in Paris waits for 07:00, the end of the default quiet hours",
    nightWarning?.dueAt.toISOString() === "2026-11-20T06:00:00.000Z",
    nightWarning?.dueAt,
  );

  const montreal = await seedFamily("montreal");
  zoneOf.set(montreal.userId, "America/Toronto");
  await service.warn(montreal, new Date("2026-11-20T04:30:00Z"));
  const [montrealWarning] = await warningsOf(montreal);
  await step(
    "a loss at 23:30 in Montreal waits for 07:00 in Montreal",
    montrealWarning?.dueAt.toISOString() === "2026-11-20T12:00:00.000Z",
    montrealWarning?.dueAt,
  );

  const offline = await seedFamily("offline", false);
  await service.warn(offline, NOW);
  await Promise.all([serviceFor().runOnce(NOW), serviceFor().runOnce(NOW)]);
  await db
    .update(alertAccessLoss)
    .set({ status: "pending", nextAttemptAt: null })
    .where(eq(alertAccessLoss.childId, offline.childId));
  await serviceFor().runOnce(NOW);
  const queued = await db
    .select({ id: emailSchema.emailMessage.id })
    .from(emailSchema.emailMessage)
    .where(
      and(
        eq(emailSchema.emailMessage.toAddress, `${offline.userId}@example.com`),
        eq(emailSchema.emailMessage.template, "access_lost"),
      ),
    );
  await step(
    "a parent without push gets one queued email, even when the warning is dispatched twice",
    queued.length === 1,
    queued.length,
  );

  await db.delete(childAccount).where(eq(childAccount.id, night.childId));
  await step(
    "a disconnected child takes its warning with it",
    (await warningsOf(night)).length === 0,
  );

  await seedSettled(intruder);
  await db.$client.query("ANALYZE alert_access_loss");
  const plan = await explainClaim();
  console.log(`\nEXPLAIN ANALYZE claim query (rolled back):\n${plan}\n`);
  await step(
    "the claim query reads alert_access_loss_pending_due_idx",
    plan.includes("alert_access_loss_pending_due_idx"),
  );
}, "the lost access warning goes out once per loss and is re-armed by a reconnection");
