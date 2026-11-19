/**
 * Proves against a real Postgres what the `ai_call` journal promises in its constraints: a
 * call is journaled through the kit's store, a row carrying free text where a hash belongs is
 * refused by the database, the retention sweep removes the rows past 90 days and keeps the
 * recent ones, and deleting the account deletes its journal.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-ai-call-journal", process.env.DATABASE_URL);

import { shiftInstant } from "@packages/ddd-kit/days";
import { authSchema, db, eq, like, sweepSchema, TransactionService } from "@packages/drizzle";
import type { AiCallEntry } from "@packages/llm/journal/ai-call-log.port";
import { DrizzleAiCallLog } from "@packages/llm/journal/drizzle-ai-call-log";
import { aiCall } from "@packages/llm/schemas/ai-call.schema";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import {
  AI_CALL_RETENTION_DAYS,
  AI_CALL_RETENTION_LABEL,
  sweepAiCallJournal,
} from "../src/workers/retention";

const probe = `check-ai-call-journal-${crypto.randomUUID()}`;
const parent = `${probe}-parent`;
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});
const journal = new DrizzleAiCallLog(instrumentation);

function entry(promptVersion: string, overrides: Partial<AiCallEntry> = {}): AiCallEntry {
  return {
    userId: parent,
    feature: "announcement_extraction",
    model: "claude-haiku-5-5",
    promptVersion,
    inputHash: "a".repeat(64),
    inputTokens: 1000,
    outputTokens: 250,
    cacheReadTokens: 2500,
    cacheWriteTokens: 0,
    costMicroUsd: 250,
    outcome: "ok",
    latencyMs: 900,
    ...overrides,
  };
}

async function versionsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ promptVersion: aiCall.promptVersion })
    .from(aiCall)
    .where(eq(aiCall.userId, userId));

  return rows.map((row) => row.promptVersion).sort();
}

const { step, run } = stepRunner("check-ai-call-journal", async () => {
  await db.delete(authSchema.user).where(like(authSchema.user.id, `${probe}-%`));
});

run(async () => {
  await db.insert(authSchema.user).values({
    id: parent,
    name: "Journal Probe",
    email: `${parent}@example.com`,
    emailVerified: true,
  });

  const recorded = await journal.record(entry("probe-recent"));
  await step("the kit's store journals a call", recorded.isSuccess, recorded);

  const freeText = await journal.record(
    entry("probe-free-text", { inputHash: "Léa a un contrôle de maths jeudi" }),
  );
  await step(
    "free text where the input hash belongs is refused by the database",
    freeText.isFailure && !(await versionsOf(parent)).includes("probe-free-text"),
    freeText,
  );

  await db.insert(aiCall).values({
    ...entry("probe-old"),
    createdAt: shiftInstant(new Date(), -(AI_CALL_RETENTION_DAYS + 1)),
  });

  const swept = await sweepAiCallJournal({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
  });
  await step("the sweep took its lease", !swept.skipped, swept);
  await step(
    "calls past 90 days leave the journal, recent ones stay",
    JSON.stringify(await versionsOf(parent)) === JSON.stringify(["probe-recent"]),
    await versionsOf(parent),
  );

  const [beat] = await db
    .select()
    .from(sweepSchema.sweepRun)
    .where(eq(sweepSchema.sweepRun.label, AI_CALL_RETENTION_LABEL));
  await step("the sweep left its heartbeat", beat?.outcome === "ok", beat);

  await db.delete(authSchema.user).where(eq(authSchema.user.id, parent));
  await step(
    "deleting the account deletes its journal",
    (await versionsOf(parent)).length === 0,
    await versionsOf(parent),
  );
}, "the model call journal keeps no free text, ages out and leaves with the account");
