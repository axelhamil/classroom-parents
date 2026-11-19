import type { AiQuotaService } from "@modules/assistant/application/services/ai-quota.service";
import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import type { ILanguageModel, LlmFeature } from "@packages/llm/contract/language-model.port";
import type { LlmError } from "@packages/llm/contract/llm-error";
import {
  BudgetedLanguageModel,
  type ILlmBudget,
  SwitchedLlmBudget,
} from "@packages/llm/decorators/budgeted-language-model";
import { CircuitBreakerLanguageModel } from "@packages/llm/decorators/circuit-breaker-language-model";
import { MeteredLanguageModel } from "@packages/llm/decorators/metered-language-model";
import type { IAiCallLog } from "@packages/llm/journal/ai-call-log.port";
import { DrizzleAiCallLog } from "@packages/llm/journal/drizzle-ai-call-log";
import { anthropicLanguageModel } from "@packages/llm/provider/anthropic-language-model";
import { MODEL_BY_TIER } from "@packages/llm/provider/models";
import { defineModule } from "inwire";

const LLM_TIMEOUT_MS = 60_000;

export interface LlmSettings {
  anthropicApiKey: string;
  disabledFeatures: readonly LlmFeature[];
}

export type LlmQuotas = Pick<AiQuotaService, "admit" | "record">;

export type LlmQuotasSource = () => LlmQuotas;

const LLM_CODE_BY_QUOTA_CODE: Record<string, LlmError["code"]> = {
  AI_BUDGET_EXHAUSTED: "LLM_BUDGET_EXHAUSTED",
  AI_UNAVAILABLE: "LLM_DISABLED",
};

function asLlmError(error: AppError): LlmError {
  return {
    code: LLM_CODE_BY_QUOTA_CODE[error.code] ?? "LLM_PROVIDER_FAILURE",
    message: error.message,
    ...(error.metadata === undefined ? {} : { metadata: error.metadata }),
    cause: error,
  };
}

/** The family's monthly quotas and the global spend breaker, as the budget the kit asks first. */
export function quotaBudgetFor(quotas: LlmQuotasSource): ILlmBudget {
  return {
    admit: async ({ scope, feature, tier }) =>
      (
        await quotas().admit({ userId: scope.userId, feature, escalation: tier === "strong" })
      ).mapError(asLlmError),
  };
}

/** The `ai_call` journal, followed by the family's monthly usage the quotas read. */
export function quotaCountingJournal(
  journal: IAiCallLog,
  quotas: LlmQuotasSource,
  instrumentation: IInstrumentation,
): IAiCallLog {
  return {
    record: async (entry) => {
      const journaled = await journal.record(entry);
      const counted = await quotas().record({
        userId: entry.userId,
        feature: entry.feature,
        escalation: entry.model === MODEL_BY_TIER.strong,
        costMicroUsd: entry.costMicroUsd,
      });
      if (counted.isFailure) instrumentation.capture(counted.getError());

      return journaled.isFailure ? journaled : Result.ok();
    },
  };
}

export function languageModelFor(
  settings: LlmSettings,
  instrumentation: IInstrumentation,
  quotas: LlmQuotasSource,
): ILanguageModel {
  const provider = anthropicLanguageModel(
    { apiKey: settings.anthropicApiKey, timeoutMs: LLM_TIMEOUT_MS },
    instrumentation,
  );
  const journal = quotaCountingJournal(
    new DrizzleAiCallLog(instrumentation),
    quotas,
    instrumentation,
  );
  const metered = new MeteredLanguageModel(provider, journal, instrumentation);
  const guarded = new CircuitBreakerLanguageModel(metered, instrumentation);
  const withinQuotas = new BudgetedLanguageModel(guarded, quotaBudgetFor(quotas));
  const switches = new SwitchedLlmBudget({
    enabled: settings.anthropicApiKey !== "",
    disabledFeatures: settings.disabledFeatures,
  });

  return new BudgetedLanguageModel(withinQuotas, switches);
}

export const llmModule = (quotas: LlmQuotasSource) =>
  defineModule<{
    IInstrumentation: IInstrumentation;
    llmSettings: LlmSettings;
  }>()((b) =>
    b.add("ILanguageModel", (c) => languageModelFor(c.llmSettings, c.IInstrumentation, quotas)),
  );
