import type { AppError, Result } from "@packages/ddd-kit";
import type { z } from "zod";

export type ExtractionError = AppError<
  | "EXTRACTION_INPUT_INVALID"
  | "EXTRACTION_OUTPUT_INVALID"
  | "EXTRACTION_PROVIDER_FAILURE"
  | "EXTRACTION_RATE_LIMITED"
>;

export type ModelTier = "fast" | "strong";

export interface LanguageModelRequest<T> {
  tier: ModelTier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

export interface ILanguageModel {
  parse<T>(request: LanguageModelRequest<T>): Promise<Result<T, ExtractionError>>;
}
