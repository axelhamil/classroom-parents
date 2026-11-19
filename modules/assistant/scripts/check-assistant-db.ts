/**
 * Proves against a real Postgres what mocked ports cannot: the monthly usage upsert is additive
 * under concurrent calls, one family's usage and preferences never count for another (the owner
 * sits in the WHERE), the 11th document of a family is refused from the stored rows while the
 * other family is admitted, the exhausted quota is announced once in the transaction of the
 * write, the global spend read from the `ai_call` journal pauses on-demand features, an operator
 * alert is claimed once per period, and an account deletion removes every assistant row by
 * foreign key cascade. Removes its probe parents.
 */

import { exitUnlessLocalDatabase, spanRecorder, stepRunner } from "@packages/test/db-check";

exitUnlessLocalDatabase("check-assistant-db", process.env.DATABASE_URL);

import { Option } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  count,
  db,
  eq,
  inArray,
  outboxSchema,
  TransactionService,
} from "@packages/drizzle";
import { EventTypes } from "@packages/events";
import { aiCall } from "@packages/llm/schemas/ai-call.schema";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { aiUsage, aiUsageAlert, assistantPreference } from "../schemas/assistant.schema";
import { AiQuotaService } from "../src/application/services/ai-quota.service";
import { PreferenceService } from "../src/application/services/preference.service";
import { DrizzleAiSpendReader } from "../src/infrastructure/repositories/drizzle-ai-spend.reader";
import { DrizzleAiUsageRepository } from "../src/infrastructure/repositories/drizzle-ai-usage.repository";
import { DrizzleAiUsageAlertLog } from "../src/infrastructure/repositories/drizzle-ai-usage-alert.log";
import { DrizzlePreferenceRepository } from "../src/infrastructure/repositories/drizzle-preference.repository";

const probe = `check-assistant-${crypto.randomUUID()}`;
const PARENT_A = `${probe}-a`;
const PARENT_B = `${probe}-b`;
const PARENTS = [PARENT_A, PARENT_B];
const ALERT_PERIOD = `${probe}-period`;
const GENEROUS_CAP = 1_000_000_000;

const { instrumentation } = spanRecorder();
const outbox = new DrizzleOutboxRepository(instrumentation, () => undefined);
const transactions = new TransactionService(instrumentation, async (events) => {
  await outbox.enqueue(events, { source: "check-assistant-db" });
});
const usage = new DrizzleAiUsageRepository(instrumentation);
const spend = new DrizzleAiSpendReader(instrumentation);

const quotasWithCap = (dailySpendCapMicroUsd: number) =>
  new AiQuotaService(usage, spend, transactions, outbox, instrumentation, {
    dailySpendCapMicroUsd,
  });

const preferences = new PreferenceService(
  new DrizzlePreferenceRepository(instrumentation),
  transactions,
  outbox,
  instrumentation,
);

const document = (userId: string) => ({
  userId,
  feature: "document_reading" as const,
  escalation: false,
});

async function storedDocuments(userId: string): Promise<{ calls: number; cost: number }> {
  const [row] = await db
    .select({ calls: aiUsage.calls, cost: aiUsage.costMicroUsd })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, "document_reading")));

  return row ?? { calls: 0, cost: 0 };
}

async function eventsOf(userId: string, type: string): Promise<number> {
  const { outboxEvent } = outboxSchema;
  const [row] = await db
    .select({ total: count() })
    .from(outboxEvent)
    .where(and(eq(outboxEvent.aggregateId, userId), eq(outboxEvent.eventType, type)));

  return row?.total ?? 0;
}

async function rowsLeft(): Promise<number> {
  const counts = await Promise.all([
    db.select({ total: count() }).from(aiUsage).where(inArray(aiUsage.userId, PARENTS)),
    db
      .select({ total: count() })
      .from(assistantPreference)
      .where(inArray(assistantPreference.userId, PARENTS)),
    db.select({ total: count() }).from(aiUsageAlert).where(inArray(aiUsageAlert.userId, PARENTS)),
  ]);

  return counts.reduce((sum, [row]) => sum + (row?.total ?? 0), 0);
}

async function cleanup(): Promise<void> {
  const { outboxEvent } = outboxSchema;
  await db.delete(outboxEvent).where(inArray(outboxEvent.aggregateId, PARENTS));
  await db.delete(aiUsageAlert).where(eq(aiUsageAlert.period, ALERT_PERIOD));
  await db.delete(authSchema.user).where(inArray(authSchema.user.id, PARENTS));
}

const { step, run } = stepRunner("check-assistant-db", cleanup);

run(async () => {
  await cleanup();
  await db
    .insert(authSchema.user)
    .values(PARENTS.map((id) => ({ id, name: id, email: `${id}@example.com` })));

  const quotas = quotasWithCap(GENEROUS_CAP);

  await Promise.all(
    Array.from({ length: 10 }, () => quotas.record({ ...document(PARENT_A), costMicroUsd: 700 })),
  );
  const stored = await storedDocuments(PARENT_A);
  await step(
    "10 concurrent documents of one family add up to 10 calls and their whole cost",
    stored.calls === 10 && stored.cost === 7_000,
    stored,
  );

  const refused = await quotas.admit(document(PARENT_A));
  const otherFamily = await quotas.admit(document(PARENT_B));
  await step(
    "the 11th document of the family is refused with the day it comes back, the other family is admitted",
    refused.isFailure &&
      refused.getError().code === "AI_BUDGET_EXHAUSTED" &&
      typeof refused.getError().metadata?.resumesOn === "string" &&
      otherFamily.isSuccess,
    { refused: refused.isFailure ? refused.getError() : "admitted", other: otherFamily.isSuccess },
  );

  await step(
    "the exhausted quota is announced once, and only for that family",
    (await eventsOf(PARENT_A, EventTypes.ASSISTANT_QUOTA_EXHAUSTED)) === 1 &&
      (await eventsOf(PARENT_B, EventTypes.ASSISTANT_QUOTA_EXHAUSTED)) === 0,
  );

  await db.insert(aiCall).values({
    userId: PARENT_B,
    feature: "translation",
    model: "claude-haiku-5-5",
    promptVersion: "check-1",
    inputHash: "0".repeat(64),
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicroUsd: 5_000,
    outcome: "ok",
    latencyMs: 1,
  });
  const paused = await quotasWithCap(1_000).admit({
    userId: PARENT_B,
    feature: "translation",
    escalation: false,
  });
  const extraction = await quotasWithCap(1_000).admit({
    userId: PARENT_B,
    feature: "announcement_extraction",
    escalation: false,
  });
  await step(
    "a day spending over the global cap pauses on-demand features, the announcement reading runs",
    paused.isFailure && paused.getError().code === "AI_UNAVAILABLE" && extraction.isSuccess,
  );

  const opposed = await preferences.setExtraction(PARENT_A, false);
  const chosen = await preferences.chooseLanguageAndRegion(PARENT_B, {
    locale: "es",
    timeZone: "Europe/Madrid",
    country: "ES",
  });
  const readA = await preferences.extractionEnabled(PARENT_A);
  const readB = await preferences.preferences(PARENT_B);
  await step(
    "one family's opposition and another's language are stored apart and announced in their write",
    opposed.isSuccess &&
      chosen.isSuccess &&
      readA.getValue() === false &&
      readB.getValue().extractionEnabled &&
      readB.getValue().locale === "es" &&
      (await eventsOf(PARENT_A, EventTypes.ASSISTANT_PREFERENCE_CHANGED)) === 1 &&
      (await eventsOf(PARENT_B, EventTypes.ASSISTANT_PREFERENCE_CHANGED)) === 1,
  );

  const alertLog = new DrizzleAiUsageAlertLog(instrumentation);
  const globalKey = {
    kind: "global_spend" as const,
    period: ALERT_PERIOD,
    userId: Option.none<string>(),
  };
  const familyKey = {
    kind: "family_cap" as const,
    period: ALERT_PERIOD,
    userId: Option.some(PARENT_A),
  };
  const first = await alertLog.claim(globalKey);
  const second = await alertLog.claim(globalKey);
  const family = await alertLog.claim(familyKey);
  await step(
    "an operator alert is claimed once per period, a global one included (no owner)",
    first.getValue() && !second.getValue() && family.getValue(),
  );

  await db.delete(authSchema.user).where(inArray(authSchema.user.id, PARENTS));
  await step(
    "deleting the accounts removes their preferences, usage and alerts",
    (await rowsLeft()) === 0,
  );
}, "the assistant preferences, quotas and alerts hold on a real database");
