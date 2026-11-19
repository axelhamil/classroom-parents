import type { Result } from "@packages/ddd-kit";
import type { LlmFeature } from "@packages/llm/contract/language-model.port";
import type { FeatureUsage, MonthlyUsage } from "../../domain/usage/quota-policy";
import type { AssistantError } from "../errors/assistant-errors";

export interface FamilyCostSpread {
  families: number;
  p50MicroUsd: number;
  p95MicroUsd: number;
}

export interface IAiUsageRepository {
  monthOf(userId: string, month: string): Promise<Result<MonthlyUsage<LlmFeature>, AssistantError>>;

  add(
    userId: string,
    month: string,
    feature: LlmFeature,
    increment: FeatureUsage,
  ): Promise<Result<void, AssistantError>>;

  familiesFrom(month: string, costMicroUsd: number): Promise<Result<string[], AssistantError>>;

  costSpread(month: string): Promise<Result<FamilyCostSpread, AssistantError>>;
}
