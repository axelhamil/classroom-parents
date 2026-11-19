import type { LlmEffort, ModelTier } from "../contract/language-model.port";

/**
 * The one table that turns a tier into a model, pinned to dated ids the eval ran against.
 * Changing a line is a pull request that passes the `ai-eval` job.
 */
export const MODEL_BY_TIER = {
  fast: "claude-haiku-5-5",
  strong: "claude-sonnet-5-5",
} as const satisfies Record<ModelTier, string>;

export type ModelId = (typeof MODEL_BY_TIER)[ModelTier];

export const MODEL_IDS = [MODEL_BY_TIER.fast, MODEL_BY_TIER.strong] as const;

export const DEFAULT_EFFORT_BY_TIER = {
  fast: "low",
  strong: "high",
} as const satisfies Record<ModelTier, LlmEffort>;

/** Tokens a provider reports for one call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface PricePerMillionTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Dollars per million tokens (platform.claude.com pricing, read 19/11/2026; Haiku below
 * 100k input tokens, 5 minute cache writes). Dollars per million tokens are micro-dollars
 * per token, which is the unit the journal and the budgets count in.
 */
const PRICE_BY_MODEL = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
} as const satisfies Record<ModelId, PricePerMillionTokens>;

/** Cost of one call in whole micro-dollars, rounded up so a budget never under-counts. */
export function costMicroUsd(model: ModelId, usage: TokenUsage): number {
  const price = PRICE_BY_MODEL[model];
  const exact =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * price.cacheRead +
    usage.cacheWriteTokens * price.cacheWrite;

  return Math.ceil(exact);
}
