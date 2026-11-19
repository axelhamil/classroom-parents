import type { IInstrumentation } from "@packages/ddd-kit";
import type { ILanguageModel, LlmFeature } from "@packages/llm/contract/language-model.port";
import {
  BudgetedLanguageModel,
  SwitchedLlmBudget,
} from "@packages/llm/decorators/budgeted-language-model";
import { CircuitBreakerLanguageModel } from "@packages/llm/decorators/circuit-breaker-language-model";
import { MeteredLanguageModel } from "@packages/llm/decorators/metered-language-model";
import { DrizzleAiCallLog } from "@packages/llm/journal/drizzle-ai-call-log";
import { anthropicLanguageModel } from "@packages/llm/provider/anthropic-language-model";
import { defineModule } from "inwire";

const LLM_TIMEOUT_MS = 60_000;

export interface LlmSettings {
  anthropicApiKey: string;
  disabledFeatures: readonly LlmFeature[];
}

export function languageModelFor(
  settings: LlmSettings,
  instrumentation: IInstrumentation,
): ILanguageModel {
  const provider = anthropicLanguageModel(
    { apiKey: settings.anthropicApiKey, timeoutMs: LLM_TIMEOUT_MS },
    instrumentation,
  );
  const journal = new DrizzleAiCallLog(instrumentation);
  const metered = new MeteredLanguageModel(provider, journal, instrumentation);
  const guarded = new CircuitBreakerLanguageModel(metered, instrumentation);
  const budget = new SwitchedLlmBudget({
    enabled: settings.anthropicApiKey !== "",
    disabledFeatures: settings.disabledFeatures,
  });

  return new BudgetedLanguageModel(guarded, budget);
}

export const llmModule = defineModule<{
  IInstrumentation: IInstrumentation;
  llmSettings: LlmSettings;
}>()((b) => b.add("ILanguageModel", (c) => languageModelFor(c.llmSettings, c.IInstrumentation)));
