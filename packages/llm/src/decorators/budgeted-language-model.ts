import { Result } from "@packages/ddd-kit";
import type {
  ILanguageModel,
  LlmFeature,
  LlmRequest,
  LlmScope,
  LlmStreamObserver,
  ModelTier,
} from "../contract/language-model.port";
import { type LlmError, llmError } from "../contract/llm-error";

/** What a budget decides on: who asks, for what, at which tier. Never the content. */
export interface LlmAdmission {
  scope: LlmScope;
  feature: LlmFeature;
  tier: ModelTier;
}

/**
 * The policy a call must pass before it costs anything: a switched off feature answers
 * `LLM_DISABLED`, a spent quota `LLM_BUDGET_EXHAUSTED`. The host binds it; quotas per family
 * plug in here without touching a caller.
 */
export interface ILlmBudget {
  admit(admission: LlmAdmission): Promise<Result<void, LlmError>>;
}

/** Asks the budget first and calls the model only when the call is admitted. */
export class BudgetedLanguageModel implements ILanguageModel {
  constructor(
    private readonly inner: ILanguageModel,
    private readonly budget: ILlmBudget,
  ) {}

  async parse<T>(request: LlmRequest<T>): Promise<Result<T, LlmError>> {
    const admitted = await this.budget.admit(request);
    if (admitted.isFailure) return Result.fail(admitted.getError());

    return this.inner.parse(request);
  }

  async streamParse<T>(
    request: LlmRequest<T>,
    observer: LlmStreamObserver,
  ): Promise<Result<T, LlmError>> {
    const admitted = await this.budget.admit(request);
    if (admitted.isFailure) return Result.fail(admitted.getError());

    return this.inner.streamParse(request, observer);
  }
}

/** The switches that need no database: a missing key or a feature turned off in settings. */
export interface LlmSwitches {
  enabled: boolean;
  disabledFeatures: readonly LlmFeature[];
}

const DISABLED = llmError("LLM_DISABLED", "This AI feature is switched off.");

/** A budget made of switches only, until per-family quotas exist. */
export class SwitchedLlmBudget implements ILlmBudget {
  constructor(private readonly switches: LlmSwitches) {}

  async admit(admission: LlmAdmission): Promise<Result<void, LlmError>> {
    const off =
      !this.switches.enabled || this.switches.disabledFeatures.includes(admission.feature);

    return off ? Result.fail(DISABLED) : Result.ok();
  }
}
