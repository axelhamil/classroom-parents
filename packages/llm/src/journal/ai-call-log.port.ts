import type { AppError, Result } from "@packages/ddd-kit";
import type { AiCallOutcome } from "../../schemas/ai-call.schema";
import type { LlmFeature } from "../contract/language-model.port";
import type { ModelId, TokenUsage } from "../provider/models";

/** What the journal keeps of one call: no prompt, no content, no output. */
export interface AiCallEntry extends TokenUsage {
  userId: string;
  feature: LlmFeature;
  model: ModelId;
  promptVersion: string;
  inputHash: string;
  costMicroUsd: number;
  outcome: AiCallOutcome;
  latencyMs: number;
}

export type AiCallLogError = AppError<"AI_CALL_LOG_PROVIDER_FAILURE">;

/** Where `MeteredLanguageModel` writes each call; the host binds the database journal. */
export interface IAiCallLog {
  record(entry: AiCallEntry): Promise<Result<void, AiCallLogError>>;
}
