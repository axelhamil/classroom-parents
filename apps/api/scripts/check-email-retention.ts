/**
 * Proves against a real Postgres that the email retention sweep purges every email that
 * left the queue once older than the retention window: sent, failed and dead alike, the
 * account deletion confirmation included. A recent one of each and an old pending one
 * stay. The run leaves its heartbeat row.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-email-retention", process.env.DATABASE_URL);

import {
  db,
  emailSchema,
  eq,
  inArray,
  like,
  sweepSchema,
  TransactionService,
} from "@packages/drizzle";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { EMAIL_RETENTION_LABEL, sweepOldEmails } from "../src/workers/retention";

const probe = `check-email-retention-${crypto.randomUUID()}`;
const DAY_MS = 86_400_000;
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});
const { emailMessage } = emailSchema;

function email(suffix: string, status: "sent" | "pending" | "failed" | "dead", ageDays: number) {
  const at = new Date(Date.now() - ageDays * DAY_MS);

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

const { step, run } = stepRunner("check-email-retention", async () => {
  await db.delete(emailMessage).where(like(emailMessage.id, `${probe}-%`));
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
}, "delivered and undelivered emails leave once past the retention window");
