/**
 * Proves against a real Postgres that the shared extraction results age out by use: the
 * retention sweep removes the ones nobody read for 60 days and keeps a result read recently,
 * however old it is, and leaves its heartbeat.
 */

import { exitUnlessLocalDatabase, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-extraction-retention", process.env.DATABASE_URL);

import { extractionResult } from "@modules/extraction/schemas/extraction-result.schema";
import { shiftInstant } from "@packages/ddd-kit/days";
import { db, eq, like, sweepSchema, TransactionService } from "@packages/drizzle";
import { logger } from "../src/shared/logger";
import { DrizzleSweepRunStore } from "../src/shared/services/drizzle-sweep-run.store";
import { NoOpInstrumentation } from "../src/shared/services/noop-instrumentation";
import {
  EXTRACTION_RESULT_RETENTION_DAYS,
  EXTRACTION_RESULT_RETENTION_LABEL,
  sweepExtractionResults,
} from "../src/workers/retention";

const probe = `check-extraction-retention-${crypto.randomUUID()}`;
const instrumentation = new NoOpInstrumentation();
const uow = new TransactionService(instrumentation, async () => {});

function result(name: string, createdDaysAgo: number, readDaysAgo: number) {
  return {
    announcementId: `${probe}-${name}`,
    contentHash: "b".repeat(64),
    publishedOn: "2026-11-09",
    timeZone: "Europe/Paris",
    promptVersion: "extraction-3",
    result: { events: [], amendments: [] },
    createdAt: shiftInstant(new Date(), -createdDaysAgo),
    lastReadAt: shiftInstant(new Date(), -readDaysAgo),
  };
}

async function namesLeft(): Promise<string[]> {
  const rows = await db
    .select({ announcementId: extractionResult.announcementId })
    .from(extractionResult)
    .where(like(extractionResult.announcementId, `${probe}-%`));

  return rows.map((row) => row.announcementId.slice(probe.length + 1)).sort();
}

const { step, run } = stepRunner("check-extraction-retention", async () => {
  await db.delete(extractionResult).where(like(extractionResult.announcementId, `${probe}-%`));
});

run(async () => {
  await db
    .insert(extractionResult)
    .values([
      result("unread", EXTRACTION_RESULT_RETENTION_DAYS + 5, EXTRACTION_RESULT_RETENTION_DAYS + 1),
      result("old-but-read", EXTRACTION_RESULT_RETENTION_DAYS + 30, 2),
      result("recent", 1, 1),
    ]);

  const swept = await sweepExtractionResults({
    uow,
    instrumentation,
    sweepRuns: new DrizzleSweepRunStore(instrumentation),
    logger,
  });
  await step("the sweep took its lease", !swept.skipped, swept);
  await step(
    "results unread for 60 days leave, results read since stay whatever their age",
    JSON.stringify(await namesLeft()) === JSON.stringify(["old-but-read", "recent"]),
    await namesLeft(),
  );

  const [beat] = await db
    .select()
    .from(sweepSchema.sweepRun)
    .where(eq(sweepSchema.sweepRun.label, EXTRACTION_RESULT_RETENTION_LABEL));
  await step("the sweep left its heartbeat", beat?.outcome === "ok", beat);
}, "shared extraction results leave once nobody reads them");
