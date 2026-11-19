import { beforeEach, describe, expect, it } from "bun:test";
import { Option, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { z } from "zod";
import type { ILanguageModel, LlmRequest } from "../contract/language-model.port";
import { type LlmError, llmError } from "../contract/llm-error";
import { BudgetedLanguageModel, SwitchedLlmBudget } from "../decorators/budgeted-language-model";
import { CircuitBreakerLanguageModel } from "../decorators/circuit-breaker-language-model";
import { MeteredLanguageModel } from "../decorators/metered-language-model";
import type { IAiCallLog } from "../journal/ai-call-log.port";
import type { ILanguageModelProvider, LlmCall } from "../provider/language-model-provider.port";

const schema = z.object({ ok: z.boolean() });
const CONTENT = "Sortie au musée de Léa jeudi, 12 € à prévoir";

const request: LlmRequest<{ ok: boolean }> = {
  scope: { userId: "parent-a" },
  feature: "announcement_extraction",
  promptVersion: "extraction-3",
  tier: "fast",
  maxOutputTokens: 400,
  system: "static system",
  context: [],
  data: CONTENT,
  schema,
};

const outage = llmError("LLM_PROVIDER_FAILURE", "down");

describe("MeteredLanguageModel", () => {
  let provider: PortMock<ILanguageModelProvider>;
  let journal: PortMock<IAiCallLog>;
  let metered: MeteredLanguageModel;

  function answers(call: Partial<LlmCall<{ ok: boolean }>>): void {
    provider.parse.mockResolvedValueOnce({
      result: Result.ok({ ok: true }),
      model: "claude-haiku-5-5",
      usage: Option.none(),
      ...call,
    });
  }

  beforeEach(() => {
    provider = mockPort<ILanguageModelProvider>();
    journal = mockPort<IAiCallLog>();
    journal.record.mockResolvedValue(Result.ok());
    metered = new MeteredLanguageModel(provider, journal, mockInstrumentation());
  });

  it("journals the call's cost for the family and the feature, without its content", async () => {
    answers({
      usage: Option.some({
        inputTokens: 1000,
        outputTokens: 300,
        cacheReadTokens: 2500,
        cacheWriteTokens: 0,
      }),
    });

    const result = await metered.parse(request);

    expect(result.getValue()).toEqual({ ok: true });
    const [entry] = journal.record.mock.calls[0] ?? [];
    expect(entry).toMatchObject({
      userId: "parent-a",
      feature: "announcement_extraction",
      model: "claude-haiku-5-5",
      promptVersion: "extraction-3",
      costMicroUsd: 275,
      outcome: "ok",
      inputHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(entry)).not.toContain("Léa");
  });

  it("journals a failed call with its outcome, at no cost when nothing was billed", async () => {
    answers({ result: Result.fail(llmError("LLM_RATE_LIMITED", "busy")) });

    await metered.parse(request);

    expect(journal.record.mock.calls[0]?.[0]).toMatchObject({
      outcome: "rate_limited",
      costMicroUsd: 0,
    });
  });

  it("returns the model's answer even when the journal cannot write", async () => {
    answers({});
    journal.record.mockResolvedValueOnce(
      Result.fail({ code: "AI_CALL_LOG_PROVIDER_FAILURE", message: "db down" }),
    );

    expect((await metered.parse(request)).getValue()).toEqual({ ok: true });
  });
});

describe("BudgetedLanguageModel with switches", () => {
  let inner: PortMock<ILanguageModel>;

  beforeEach(() => {
    inner = mockPort<ILanguageModel>();
    inner.parse.mockResolvedValue(Result.ok({ ok: true }));
  });

  it("refuses every call without reaching the model when AI is off, e.g. no key", async () => {
    const model = new BudgetedLanguageModel(
      inner,
      new SwitchedLlmBudget({ enabled: false, disabledFeatures: [] }),
    );

    expect((await model.parse(request)).getError().code).toBe("LLM_DISABLED");
    expect(inner.parse).not.toHaveBeenCalled();
  });

  it("refuses a feature switched off in settings", async () => {
    const model = new BudgetedLanguageModel(
      inner,
      new SwitchedLlmBudget({ enabled: true, disabledFeatures: ["announcement_extraction"] }),
    );

    expect((await model.parse(request)).getError().code).toBe("LLM_DISABLED");
  });

  it("lets an admitted call through", async () => {
    const model = new BudgetedLanguageModel(
      inner,
      new SwitchedLlmBudget({ enabled: true, disabledFeatures: [] }),
    );

    expect((await model.parse(request)).getValue()).toEqual({ ok: true });
  });
});

describe("CircuitBreakerLanguageModel", () => {
  let inner: PortMock<ILanguageModel>;
  let now: number;
  let breaker: CircuitBreakerLanguageModel;

  async function failTimes(count: number, error: LlmError = outage): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      inner.parse.mockResolvedValueOnce(Result.fail(error));
      await breaker.parse(request);
      now += 1_000;
    }
  }

  beforeEach(() => {
    inner = mockPort<ILanguageModel>();
    now = 0;
    breaker = new CircuitBreakerLanguageModel(inner, mockInstrumentation(), undefined, () => now);
  });

  it("stops calling the provider after 5 outages in 60 s, for 2 minutes", async () => {
    await failTimes(5);

    const paused = await breaker.parse(request);

    expect(paused.getError()).toMatchObject({ code: "LLM_PROVIDER_FAILURE" });
    expect(inner.parse).toHaveBeenCalledTimes(5);
  });

  it("probes again after the pause and closes on a success", async () => {
    await failTimes(5);
    now += 120_000;
    inner.parse.mockResolvedValue(Result.ok({ ok: true }));

    expect((await breaker.parse(request)).isSuccess).toBe(true);
    expect((await breaker.parse(request)).isSuccess).toBe(true);
    expect(inner.parse).toHaveBeenCalledTimes(7);
  });

  it("reopens at once when the probe fails", async () => {
    await failTimes(5);
    now += 120_000;
    await failTimes(1);

    await breaker.parse(request);

    expect(inner.parse).toHaveBeenCalledTimes(6);
  });

  it("does not count outages spread over more than 60 s", async () => {
    await failTimes(4);
    now += 60_000;
    await failTimes(1);
    inner.parse.mockResolvedValueOnce(Result.ok({ ok: true }));

    expect((await breaker.parse(request)).isSuccess).toBe(true);
  });

  it("does not count unreadable answers nor calls its caller aborted", async () => {
    await failTimes(5, llmError("LLM_OUTPUT_INVALID", "bad json"));
    await failTimes(5, llmError("LLM_PROVIDER_FAILURE", "aborted", { aborted: true }));
    inner.parse.mockResolvedValueOnce(Result.ok({ ok: true }));

    expect((await breaker.parse(request)).isSuccess).toBe(true);
  });
});
