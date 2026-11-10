/**
 * Proves against a real Postgres that the email retention sweep purges every email that
 * left the queue once older than the retention window: sent, failed and dead alike, the
 * account deletion confirmation included. A recent one of each and an old pending one
 * stay. The run leaves its heartbeat row. The outbox sweep removes delivered events past
 * its window and keeps a recent delivered one, a dead one and a pending one. An email
 * queued to be erased once settled, the account deletion confirmation, leaves the queue
 * the moment it is sent or refused, address included. Dead, it stays for its replays and
 * leaves at its final death, when its next replay would fall past the replay window; it
 * also stays while it retries. A dead one the worker never replayed again leaves with the
 * sweep once past the replay window, a dead one still inside it stays.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-email-retention", process.env.DATABASE_URL);

import { shiftInstant } from "@packages/ddd-kit/days";
import {
  db,
  emailSchema,
  eq,
  inArray,
  like,
  outboxSchema,
  sweepSchema,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import { QueuedEmailService } from "@packages/email/email.service";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import {
  EMAIL_RETENTION_LABEL,
  OUTBOX_RETENTION_LABEL,
  sweepDeliveredOutbox,
  sweepOldEmails,
} from "../src/workers/retention";

const probe = `check-email-retention-${crypto.randomUUID()}`;
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});
const { emailMessage } = emailSchema;
const { outboxEvent } = outboxSchema;

function email(suffix: string, status: "sent" | "pending" | "failed" | "dead", ageDays: number) {
  const at = shiftInstant(new Date(), -ageDays);

  return {
    id: `${probe}-${suffix}`,
    kind: "raw" as const,
    toAddress: `${probe}@example.com`,
    subject: "probe",
    payload: {},
    status,
    sentAt: status === "sent" ? at : null,
    createdAt: at,
  };
}

async function remaining(): Promise<string[]> {
  const rows = await db
    .select({ id: emailMessage.id })
    .from(emailMessage)
    .where(like(emailMessage.id, `${probe}-%`));
  return rows.map((row) => row.id.slice(probe.length + 1)).sort();
}

function outboxRow(suffix: string, state: "delivered" | "dead" | "pending", ageDays: number) {
  const at = shiftInstant(new Date(), -ageDays);

  return {
    id: `${probe}-${suffix}`,
    eventType: `${probe}.event`,
    aggregateId: probe,
    aggregateType: "probe",
    payload: {},
    metadata: {
      specversion: "1.0" as const,
      source: "check/email-retention",
      datacontenttype: "application/json" as const,
    },
    occurredAt: at,
    dispatchedAt: state === "delivered" ? at : null,
    deadAt: state === "dead" ? at : null,
  };
}

async function remainingOutbox(): Promise<string[]> {
  const rows = await db
    .select({ id: outboxEvent.id })
    .from(outboxEvent)
    .where(like(outboxEvent.id, `${probe}-%`));
  return rows.map((row) => row.id.slice(probe.length + 1)).sort();
}

const { step, run } = stepRunner("check-email-retention", async () => {
  await db.delete(emailMessage).where(like(emailMessage.id, `${probe}-%`));
  await db.delete(emailMessage).where(like(emailMessage.idempotencyKey, `${probe}-%`));
  await db.delete(outboxEvent).where(like(outboxEvent.id, `${probe}-%`));
});

run(async () => {
  await db.insert(emailMessage).values([
    email("old-sent", "sent", 30),
    {
      ...email("old-failed", "failed", 30),
      kind: "template" as const,
      template: "delete_completed",
      payload: { name: "Parent sonde" },
      idempotencyKey: `delete-completed/${probe}`,
    },
    email("old-dead", "dead", 30),
    email("recent-sent", "sent", 1),
    email("recent-failed", "failed", 1),
    email("recent-dead", "dead", 1),
    email("old-pending", "pending", 30),
    { ...email("stranded-erasable-dead", "dead", 2), eraseOnSettle: true },
    { ...email("replaying-erasable-dead", "dead", 0.5), eraseOnSettle: true },
  ]);

  const swept = await sweepOldEmails({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
    retentionDays: 7,
    deadReplayWindowHours: 24,
  });

  await step("the run took the lease and was not skipped", !swept.skipped, swept);
  await step(
    "sent, failed and dead emails older than the window and erasable dead ones past the replay window are purged, the rest stays",
    JSON.stringify(await remaining()) ===
      JSON.stringify([
        "old-pending",
        "recent-dead",
        "recent-failed",
        "recent-sent",
        "replaying-erasable-dead",
      ]),
    await remaining(),
  );

  const [beat] = await db
    .select()
    .from(sweepSchema.sweepRun)
    .where(inArray(sweepSchema.sweepRun.label, [EMAIL_RETENTION_LABEL]));
  await step("the run left its heartbeat", beat?.outcome === "ok", beat);

  const [lease] = await db
    .select()
    .from(sweepSchema.sweepLock)
    .where(eq(sweepSchema.sweepLock.label, EMAIL_RETENTION_LABEL));
  await step("the lease is released", lease === undefined, lease);

  await db
    .insert(outboxEvent)
    .values([
      outboxRow("old-delivered", "delivered", 30),
      outboxRow("recent-delivered", "delivered", 1),
      outboxRow("old-dead", "dead", 30),
      outboxRow("old-pending", "pending", 30),
    ]);

  const sweptOutbox = await sweepDeliveredOutbox({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
  });

  await step("the outbox run took its lease", !sweptOutbox.skipped, sweptOutbox);
  await step(
    "delivered outbox events past the window are purged, dead, pending and recent ones stay",
    JSON.stringify(await remainingOutbox()) ===
      JSON.stringify(["old-dead", "old-pending", "recent-delivered"]),
    await remainingOutbox(),
  );

  const [outboxBeat] = await db
    .select()
    .from(sweepSchema.sweepRun)
    .where(eq(sweepSchema.sweepRun.label, OUTBOX_RETENTION_LABEL));
  await step("the outbox run left its heartbeat", outboxBeat?.outcome === "ok", outboxBeat);

  const queue = new DrizzleEmailQueue(instrumentation, logger);
  const emails = new QueuedEmailService(queue, instrumentation);
  const confirmation = (key: string, eraseOnSettle: boolean) =>
    emails.sendTemplate(
      "delete_completed",
      `${probe}-${key}@example.com`,
      { name: "Parent sonde" },
      { idempotencyKey: `${probe}-${key}`, eraseOnSettle },
    );
  for (const [key, erase] of [
    ["erase-sent", true],
    ["erase-refused", true],
    ["erase-dead", true],
    ["erase-last-replay", true],
    ["erase-retrying", true],
    ["kept-sent", false],
  ] as const)
    await confirmation(key, erase);
  const probeRows = await db
    .select({
      id: emailMessage.id,
      attempts: emailMessage.attempts,
      key: emailMessage.idempotencyKey,
    })
    .from(emailMessage)
    .where(like(emailMessage.idempotencyKey, `${probe}-%`));
  await db
    .update(emailMessage)
    .set({ attempts: 1 })
    .where(like(emailMessage.idempotencyKey, `${probe}-%`));
  const leaseOf = (key: string) =>
    probeRows
      .filter((row) => row.key?.startsWith(`${probe}-${key}#`))
      .map((row) => ({ id: row.id, attempts: row.attempts + 1 }));

  await queue.markSent([...leaseOf("erase-sent"), ...leaseOf("kept-sent")], {});
  await queue.markFailed(leaseOf("erase-refused"), { status: "failed", lastError: "refused" });
  await queue.markFailed(leaseOf("erase-dead"), {
    status: "dead",
    lastError: "exhausted",
    retryAfterSeconds: 3600,
    replayWindowHours: 24,
  });
  await queue.markFailed(leaseOf("erase-last-replay"), {
    status: "dead",
    lastError: "exhausted",
    retryAfterSeconds: 25 * 3600,
    replayWindowHours: 24,
  });
  await queue.markFailed(leaseOf("erase-retrying"), {
    status: "pending",
    lastError: "timeout",
    retryAfterSeconds: 60,
  });

  const settled = await db
    .select({ key: emailMessage.idempotencyKey, status: emailMessage.status })
    .from(emailMessage)
    .where(like(emailMessage.idempotencyKey, `${probe}-%`));
  await step(
    "an email queued to be erased leaves once sent, refused or past its last replay, address included, and stays while dead in the window or retrying",
    JSON.stringify(
      settled
        .map((row) => `${row.key?.slice(probe.length + 1).split("#")[0]}:${row.status}`)
        .sort(),
    ) === JSON.stringify(["erase-dead:dead", "erase-retrying:pending", "kept-sent:sent"]),
    settled,
  );
}, "emails and delivered outbox events leave once past their retention window");
