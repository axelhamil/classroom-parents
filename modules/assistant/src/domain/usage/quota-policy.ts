import { Result } from "@packages/ddd-kit";

export interface FeatureUsage {
  calls: number;
  escalations: number;
  costMicroUsd: number;
}

export const NO_USAGE: FeatureUsage = { calls: 0, escalations: 0, costMicroUsd: 0 };

export interface FeatureQuota {
  firstReads: number | null;
  escalations: number;
  costMicroUsd: number;
  essential: boolean;
}

export type MonthlyUsage<F extends string> = Partial<Record<F, FeatureUsage>>;

export interface QuotaAsk<F extends string> {
  feature: F;
  escalation: boolean;
}

export type QuotaRefusal = "paused" | "family_cap" | "feature_quota";

export class QuotaPolicy<F extends string> {
  constructor(
    private readonly quotas: Record<F, FeatureQuota>,
    private readonly familyCapMicroUsd: number,
  ) {}

  verdict(usage: MonthlyUsage<F>, ask: QuotaAsk<F>, paused: boolean): Result<void, QuotaRefusal> {
    if (this.alwaysAdmits(ask)) return Result.ok();

    const quota = this.quotas[ask.feature];
    if (paused) return Result.fail("paused");
    if (this.familyCost(usage) >= this.familyCapMicroUsd) return Result.fail("family_cap");
    if (this.featureSpent(usage[ask.feature] ?? NO_USAGE, quota, ask.escalation))
      return Result.fail("feature_quota");

    return Result.ok();
  }

  alwaysAdmits(ask: QuotaAsk<F>): boolean {
    return this.quotas[ask.feature].essential && !ask.escalation;
  }

  familyCost(usage: MonthlyUsage<F>): number {
    return Object.values<FeatureUsage | undefined>(usage).reduce(
      (total, feature) => total + (feature?.costMicroUsd ?? 0),
      0,
    );
  }

  private featureSpent(used: FeatureUsage, quota: FeatureQuota, escalation: boolean): boolean {
    if (used.costMicroUsd >= quota.costMicroUsd) return true;
    if (escalation) return used.escalations >= quota.escalations;

    const firstReads = used.calls - used.escalations;
    return quota.firstReads !== null && firstReads >= quota.firstReads;
  }
}
