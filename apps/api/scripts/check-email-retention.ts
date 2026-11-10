/**
 * Proves against a real Postgres that the email retention sweep purges sent emails once
 * they are older than the retention window, and only them: a recent sent email, an old
 * pending one and an old dead one stay. The run leaves its heartbeat row.
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
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import { EMAIL_RETENTION_LABEL, sweepSentEmails } from "../src/workers/retention";

const probe = `check-email-retention-${crypto.randomUUID()}`;
const DAY_MS = 86_400_000;
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});
const { emailMessage } = emailSchema;

function email(suffix: string, status: "sent" | "pending" | "dead", ageDays: number) {
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
  await db
    .insert(emailMessage)
    .values([
      email("old-sent", "sent", 8),
      email("recent-sent", "sent", 1),
      email("old-pending", "pending", 30),
      email("old-dead", "dead", 30),
    ]);

  const swept = await sweepSentEmails({ uow, instrumentation, logger, retentionDays: 7 });

  await step("the run took the lease and was not skipped", !swept.skipped, swept);
  await step(
    "only the sent email older than the window is purged",
    JSON.stringify(await remaining()) ===
      JSON.stringify(["old-dead", "old-pending", "recent-sent"]),
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
}, "sent emails leave once past the retention window");
