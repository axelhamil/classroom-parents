/**
 * Proves against a real Postgres that the email retention sweep purges every email that
 * left the queue once older than the retention window: sent, failed and dead alike, the
 * account deletion confirmation included. A recent one of each and an old pending one
 * stay. The run leaves its heartbeat row. The outbox sweep removes delivered events past
 * its window and keeps a recent delivered one, a dead one and a pending one.
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
  ]);

  const swept = await sweepOldEmails({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
    retentionDays: 7,
  });

  await step("the run took the lease and was not skipped", !swept.skipped, swept);
  await step(
    "sent, failed and dead emails older than the window are purged, the rest stays",
    JSON.stringify(await remaining()) ===
      JSON.stringify(["old-pending", "recent-dead", "recent-failed", "recent-sent"]),
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
}, "emails and delivered outbox events leave once past their retention window");
