import { describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import type { AiCallEntry } from "@packages/llm/journal/ai-call-log.port";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { z } from "zod";
import { envSchema } from "../../shared/env-schema";
import { type LlmQuotas, languageModelFor, quotaCountingJournal } from "../llm";

const withinQuotas = (): LlmQuotas => ({
  admit: async () => Result.ok(),
  record: async () => Result.ok(),
});

const request = {
  scope: { userId: "parent-a" },
  feature: "announcement_extraction" as const,
  promptVersion: "extraction-2",
  tier: "fast" as const,
  maxOutputTokens: 400,
  system: "static system",
  context: [],
  data: "Contrôle jeudi",
  schema: z.object({ ok: z.boolean() }),
};

describe("languageModelFor", () => {
  it("switches every model feature off when the key is absent, without reaching the provider", async () => {
    const instrumentation = mockInstrumentation();
    const model = languageModelFor(
      { anthropicApiKey: "", disabledFeatures: [] },
      instrumentation,
      withinQuotas,
    );

    const result = await model.parse(request);

    expect(result.getError().code).toBe("LLM_DISABLED");
    expect(instrumentation.startSpan).not.toHaveBeenCalled();
  });

  it("switches off a feature listed in the settings", async () => {
    const model = languageModelFor(
      { anthropicApiKey: "sk-ant-test", disabledFeatures: ["announcement_extraction"] },
      mockInstrumentation(),
      withinQuotas,
    );

    expect((await model.parse(request)).getError().code).toBe("LLM_DISABLED");
  });

  it("refuses a call over the family's quota before it reaches the provider, with the day it comes back", async () => {
    const instrumentation = mockInstrumentation();
    const model = languageModelFor(
      { anthropicApiKey: "sk-ant-test", disabledFeatures: [] },
      instrumentation,
      () => ({
        ...withinQuotas(),
        admit: async () =>
          Result.fail({
            code: "AI_BUDGET_EXHAUSTED" as const,
            message: "used up",
            metadata: { feature: "document_reading", resumesOn: "2026-12-01" },
          }),
      }),
    );

    const error = (await model.parse({ ...request, feature: "document_reading" })).getError();

    expect(error.code).toBe("LLM_BUDGET_EXHAUSTED");
    expect(error.metadata).toEqual({ feature: "document_reading", resumesOn: "2026-12-01" });
    expect(instrumentation.startSpan).not.toHaveBeenCalled();
  });
});

describe("quotaCountingJournal", () => {
  const entry: AiCallEntry = {
    userId: "parent-a",
    feature: "document_reading",
    model: "claude-sonnet-5-5",
    promptVersion: "document-1",
    inputHash: "a".repeat(64),
    inputTokens: 3100,
    outputTokens: 400,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicroUsd: 13_000,
    outcome: "ok",
    latencyMs: 900,
  };

  it("journals the call, then counts it in the family's month as an escalation when it ran on the strong tier", async () => {
    const counted: unknown[] = [];
    const journal = quotaCountingJournal(
      { record: async () => Result.ok() },
      () => ({
        ...withinQuotas(),
        record: async (spent) => {
          counted.push(spent);
          return Result.ok();
        },
      }),
      mockInstrumentation(),
    );

    await journal.record(entry);

    expect(counted).toEqual([
      { userId: "parent-a", feature: "document_reading", escalation: true, costMicroUsd: 13_000 },
    ]);
  });
});

describe("AI_DISABLED_FEATURES", () => {
  const disabled = (value: string | undefined) =>
    envSchema.shape.AI_DISABLED_FEATURES.safeParse(value);

  it("reads a comma separated list of known features and defaults to none", () => {
    expect(disabled(" announcement_extraction ,").data).toEqual(["announcement_extraction"]);
    expect(disabled(undefined).data).toEqual([]);
  });

  it("refuses a feature the kit does not know, so a typo cannot leave it on", () => {
    expect(disabled("announcement_extractoin").success).toBe(false);
  });
});
