import { type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { LLM_FEATURES, type LlmFeature } from "@packages/llm/contract/language-model.port";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { spendIsAbnormal } from "../../domain/usage/daily-spend";
import {
  type FeatureUsage,
  type MonthlyUsage,
  NO_USAGE,
  QuotaPolicy,
} from "../../domain/usage/quota-policy";
import { type UsageMonth, usageMonthOf } from "../../domain/usage/usage-month";
import {
  type AssistantSettings,
  FAMILY_MONTHLY_CAP_MICRO_USD,
  FEATURE_QUOTAS,
} from "../config/ai-quotas";
import {
  type AssistantError,
  aiPaused,
  type QuotaError,
  quotaExhausted,
} from "../errors/assistant-errors";
import type { IAiSpendReader } from "../ports/ai-spend-reader.port";
import type { IAiUsageRepository } from "../ports/ai-usage-repository.port";

const PAUSE_CHECK_TTL_MS = 60_000;

export interface AiAsk {
  userId: string;
  feature: LlmFeature;
  escalation: boolean;
}

export interface AiSpent extends AiAsk {
  costMicroUsd: number;
}

interface PauseCheck {
  paused: boolean;
  checkedAt: number;
}

type Usage = MonthlyUsage<LlmFeature>;

function plus(used: FeatureUsage, spent: AiSpent): FeatureUsage {
  return {
    calls: used.calls + 1,
    escalations: used.escalations + (spent.escalation ? 1 : 0),
    costMicroUsd: used.costMicroUsd + spent.costMicroUsd,
  };
}

function minus(used: FeatureUsage, spent: AiSpent): FeatureUsage {
  return {
    calls: used.calls - 1,
    escalations: used.escalations - (spent.escalation ? 1 : 0),
    costMicroUsd: used.costMicroUsd - spent.costMicroUsd,
  };
}

export class AiQuotaService {
  private readonly policy = new QuotaPolicy(FEATURE_QUOTAS, FAMILY_MONTHLY_CAP_MICRO_USD);
  private pauseCheck: PauseCheck | undefined;

  constructor(
    private readonly usage: IAiUsageRepository,
    private readonly spend: IAiSpendReader,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: AssistantSettings,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async admit(ask: AiAsk): Promise<Result<void, QuotaError>> {
    if (this.policy.alwaysAdmits(ask)) return Result.ok();

    return this.span("admit", async () => {
      const now = this.clock();
      const month = usageMonthOf(now);

      const used = await this.usage.monthOf(ask.userId, month.month);
      if (used.isFailure) return Result.fail(used.getError());

      const paused = await this.pausedAt(now);
      const verdict = this.policy.verdict(used.getValue(), ask, paused);
      if (verdict.isSuccess) return Result.ok();
      if (verdict.getError() === "paused") return Result.fail(aiPaused(ask.feature));

      return Result.fail(quotaExhausted(ask.feature, month.resumesOn));
    });
  }

  async record(spent: AiSpent): Promise<Result<void, AssistantError>> {
    if (spent.costMicroUsd === 0) return Result.ok();

    return this.span("record", () =>
      this.transactions.run(async () => {
        const month = usageMonthOf(this.clock());

        const added = await this.usage.add(
          spent.userId,
          month.month,
          spent.feature,
          plus(NO_USAGE, spent),
        );
        if (added.isFailure) return Result.fail(added.getError());

        const after = await this.usage.monthOf(spent.userId, month.month);
        if (after.isFailure) return Result.fail(after.getError());

        await this.announceExhausted(spent, month, after.getValue());
        return Result.ok();
      }),
    );
  }

  private async announceExhausted(spent: AiSpent, month: UsageMonth, after: Usage): Promise<void> {
    const recorded = after[spent.feature] ?? NO_USAGE;
    const before: Usage = { ...after, [spent.feature]: minus(recorded, spent) };
    const closed = LLM_FEATURES.filter(
      (feature) => this.isOpen(before, feature) && !this.isOpen(after, feature),
    );

    for (const feature of closed)
      await emitEvent(this.outbox, EventTypes.ASSISTANT_QUOTA_EXHAUSTED, "user", spent.userId, {
        userId: spent.userId,
        feature,
        month: month.month,
        resumesOn: month.resumesOn,
        actorUserId: null,
      });
  }

  private isOpen(usage: Usage, feature: LlmFeature): boolean {
    return this.policy.verdict(usage, { feature, escalation: false }, false).isSuccess;
  }

  private async pausedAt(now: Date): Promise<boolean> {
    const cached = this.pauseCheck;
    if (cached && now.getTime() - cached.checkedAt < PAUSE_CHECK_TTL_MS) return cached.paused;

    const spend = await this.spend.dailySpend(now);
    if (spend.isFailure) {
      this.instrumentation.capture(spend.getError());
      return cached?.paused ?? false;
    }

    const paused = spendIsAbnormal(spend.getValue(), this.settings.dailySpendCapMicroUsd);
    this.pauseCheck = { paused, checkedAt: now.getTime() };
    return paused;
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `AiQuotaService > ${method}`, op: "function" },
      work,
    );
  }
}
