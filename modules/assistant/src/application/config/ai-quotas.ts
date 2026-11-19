import type { LlmFeature } from "@packages/llm/contract/language-model.port";
import type { FeatureQuota } from "../../domain/usage/quota-policy";

export const FAMILY_MONTHLY_CAP_MICRO_USD = 250_000;

export const FAMILY_ALERT_SHARE = 0.8;

export const FEATURE_QUOTAS = {
  announcement_extraction: {
    firstReads: null,
    escalations: Number.POSITIVE_INFINITY,
    costMicroUsd: 80_000,
    essential: true,
  },
  document_reading: { firstReads: 10, escalations: 3, costMicroUsd: 50_000, essential: false },
  quick_add: { firstReads: 30, escalations: 0, costMicroUsd: 6_000, essential: false },
  translation: { firstReads: 150, escalations: 0, costMicroUsd: 30_000, essential: false },
} as const satisfies Record<LlmFeature, FeatureQuota>;

export const OUTPUT_INVALID_ALERT_RATE = 0.05;

export const OUTPUT_INVALID_MIN_CALLS = 20;

export interface AssistantSettings {
  dailySpendCapMicroUsd: number;
}
