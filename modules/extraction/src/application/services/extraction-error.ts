import type { AppError } from "@packages/ddd-kit";
import type { LlmError, LlmErrorCode } from "@packages/llm/contract/llm-error";

export type ExtractionError = AppError<
  | "EXTRACTION_INPUT_INVALID"
  | "EXTRACTION_OUTPUT_INVALID"
  | "EXTRACTION_PROVIDER_FAILURE"
  | "EXTRACTION_RATE_LIMITED"
  | "EXTRACTION_CACHE_ENTRY_NOT_FOUND"
>;

export const NOT_CACHED: ExtractionError = {
  code: "EXTRACTION_CACHE_ENTRY_NOT_FOUND",
  message:
    "Cette annonce n'a pas encore été lue avec la version actuelle, seul le modèle peut la lire.",
};

const RATE_LIMITED: ExtractionError = {
  code: "EXTRACTION_RATE_LIMITED",
  message: "Le service d'extraction est saturé, l'annonce sera relue au prochain passage.",
};

const PROVIDER_FAILURE: ExtractionError = {
  code: "EXTRACTION_PROVIDER_FAILURE",
  message: "Le service d'extraction n'a pas répondu, l'annonce sera relue au prochain passage.",
};

const OUTPUT_INVALID: ExtractionError = {
  code: "EXTRACTION_OUTPUT_INVALID",
  message:
    "La réponse du service d'extraction était illisible, l'annonce sera relue au prochain passage.",
};

const INPUT_REJECTED: ExtractionError = {
  code: "EXTRACTION_INPUT_INVALID",
  message: "Le service d'extraction a refusé cette annonce telle qu'elle a été envoyée.",
};

const EXTRACTION_ERROR_BY_LLM_CODE: Record<LlmErrorCode, ExtractionError> = {
  LLM_INPUT_INVALID: INPUT_REJECTED,
  LLM_OUTPUT_INVALID: OUTPUT_INVALID,
  LLM_RATE_LIMITED: RATE_LIMITED,
  LLM_PROVIDER_FAILURE: PROVIDER_FAILURE,
  LLM_BUDGET_EXHAUSTED: PROVIDER_FAILURE,
  LLM_DISABLED: PROVIDER_FAILURE,
};

export function extractionErrorOf(error: LlmError): ExtractionError {
  return { ...EXTRACTION_ERROR_BY_LLM_CODE[error.code], cause: error };
}
