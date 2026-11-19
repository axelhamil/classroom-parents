import { createHash } from "node:crypto";
import type { IInstrumentation, Result } from "@packages/ddd-kit";
import type { AiCallOutcome } from "../../schemas/ai-call.schema";
import type {
  ILanguageModel,
  LlmRequest,
  LlmStreamObserver,
} from "../contract/language-model.port";
import type { LlmError, LlmErrorCode } from "../contract/llm-error";
import type { AiCallEntry, IAiCallLog } from "../journal/ai-call-log.port";
import type { ILanguageModelProvider, LlmCall } from "../provider/language-model-provider.port";
import { costMicroUsd, type TokenUsage } from "../provider/models";

const NO_TOKENS: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

const OUTCOME_BY_CODE: Partial<Record<LlmErrorCode, AiCallOutcome>> = {
  LLM_INPUT_INVALID: "input_invalid",
  LLM_OUTPUT_INVALID: "output_invalid",
  LLM_RATE_LIMITED: "rate_limited",
};

function outcomeOf(result: Result<unknown, LlmError>): AiCallOutcome {
  if (result.isSuccess) return "ok";

  const error = result.getError();
  if (error.metadata?.aborted === true) return "aborted";

  return OUTCOME_BY_CODE[error.code] ?? "provider_failure";
}

function inputHash<T>(request: LlmRequest<T>): string {
  const hash = createHash("sha256");
  if (typeof request.data === "string") return hash.update(request.data).digest("hex");

  for (const part of request.data)
    hash
      .update(part.kind)
      .update("\n")
      .update(part.kind === "text" ? part.text : part.base64);

  return hash.digest("hex");
}

function entryFor<T>(request: LlmRequest<T>, call: LlmCall<T>, latencyMs: number): AiCallEntry {
  const usage = call.usage.unwrapOr(NO_TOKENS);

  return {
    ...usage,
    userId: request.scope.userId,
    feature: request.feature,
    model: call.model,
    promptVersion: request.promptVersion,
    inputHash: inputHash(request),
    costMicroUsd: costMicroUsd(call.model, usage),
    outcome: outcomeOf(call.result),
    latencyMs,
  };
}

/**
 * Turns a provider into the `ILanguageModel` modules consume, and writes one `ai_call` row
 * per call with its cost in micro-dollars, attributed to the family and the feature. A
 * journal failure is reported by the journal and never fails the call it describes.
 */
export class MeteredLanguageModel implements ILanguageModel {
  constructor(
    private readonly provider: ILanguageModelProvider,
    private readonly journal: IAiCallLog,
    private readonly instrumentation: IInstrumentation,
  ) {}

  parse<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> {
    return this.metered(request, "parse", () => this.provider.parse(request));
  }

  streamParse<T>(
    request: LlmRequest<T>,
    observer: LlmStreamObserver,
  ): Promise<Result<T, LlmError>> {
    return this.metered(request, "streamParse", () => this.provider.streamParse(request, observer));
  }

  private metered<T>(
    request: LlmRequest<T>,
    method: string,
    call: () => Promise<LlmCall<T>>,
  ): Promise<Result<T, LlmError>> {
    return this.instrumentation.startSpan(
      { name: `MeteredLanguageModel > ${method}` },
      async () => {
        const startedAt = performance.now();
        const done = await call();
        const entry = entryFor(request, done, Math.round(performance.now() - startedAt));

        this.instrumentation.setSpanAttributes({
          "llm.feature": entry.feature,
          "llm.model": entry.model,
          "llm.prompt_version": entry.promptVersion,
          "llm.cost_micro_usd": entry.costMicroUsd,
          "llm.cache_hit": entry.cacheReadTokens > 0,
          "llm.outcome": entry.outcome,
        });
        await this.journal.record(entry);

        return done.result;
      },
    );
  }
}
