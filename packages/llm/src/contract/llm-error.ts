import type { AppError } from "@packages/ddd-kit";

/**
 * The one failure shape of a model call. Each module narrows it to its own codes at its
 * boundary, so a caller never branches on a provider's exception.
 */
export type LlmErrorCode =
  | "LLM_INPUT_INVALID"
  | "LLM_OUTPUT_INVALID"
  | "LLM_PROVIDER_FAILURE"
  | "LLM_RATE_LIMITED"
  | "LLM_BUDGET_EXHAUSTED"
  | "LLM_DISABLED";

export type LlmError = AppError<LlmErrorCode>;

/** Builds an `LlmError`; `metadata` carries machine-readable detail, never content. */
export function llmError(
  code: LlmErrorCode,
  message: string,
  metadata?: Record<string, unknown>,
): LlmError {
  return metadata === undefined ? { code, message } : { code, message, metadata };
}

/**
 * True for a failure that says the provider is unavailable (outage or rate limit) rather
 * than a refusal of this one request; a caller aborting its own stream is not an outage.
 */
export function isProviderOutage(error: LlmError): boolean {
  if (error.metadata?.aborted === true) return false;

  return error.code === "LLM_PROVIDER_FAILURE" || error.code === "LLM_RATE_LIMITED";
}
