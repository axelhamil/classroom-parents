import type { Result } from "@packages/ddd-kit";
import type { z } from "zod";
import type { LlmError } from "./llm-error";

/**
 * Every product feature that may call a model. Closed on purpose: the cost journal, the
 * budgets and the kill switch key on it, so a new caller is a reviewed change of this list.
 */
export const LLM_FEATURES = ["announcement_extraction"] as const;
export type LlmFeature = (typeof LLM_FEATURES)[number];

/**
 * The capability a call needs, never a model id: `fast` is the default everywhere, `strong`
 * is the capped escalation. The tier to model table lives in one file of the provider.
 */
export const MODEL_TIERS = ["fast", "strong"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

export type LlmEffort = "low" | "medium" | "high";

/** Untrusted bytes a caller hands over as they are: text, a picture or a PDF, base64 encoded. */
export type ContentPart =
  | { kind: "text"; text: string }
  | { kind: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }
  | { kind: "pdf"; base64: string };

/**
 * The family a call is made for, taken from the session or the job that owns the data.
 * Costs and budgets are attributed to it; it never reaches the prompt.
 */
export interface LlmScope {
  userId: string;
}

/**
 * One structured call. `system` holds the instructions and must be a constant (it is the only
 * cached block); `context` holds the facts our own code computed (dates, time zone); `data`
 * holds what a third party wrote, which the provider fences between per-request nonce tags.
 */
export interface LlmRequest<T> {
  scope: LlmScope;
  feature: LlmFeature;
  promptVersion: string;
  tier: ModelTier;
  effort?: LlmEffort;
  maxOutputTokens: number;
  system: string;
  context: readonly string[];
  data: string | readonly ContentPart[];
  schema: z.ZodType<T>;
}

/** What a streamed call reports while it runs: the JSON text received so far. */
export interface LlmStreamObserver {
  onPartialJson(snapshot: string): void;
  signal?: AbortSignal;
}

/**
 * The port every module consumes. Outputs are untrusted data: they come back parsed by the
 * request schema, and the caller still checks them against its source before using them.
 */
export interface ILanguageModel {
  parse<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>>;
  streamParse<T>(request: LlmRequest<T>, observer: LlmStreamObserver): Promise<Result<T, LlmError>>;
}
