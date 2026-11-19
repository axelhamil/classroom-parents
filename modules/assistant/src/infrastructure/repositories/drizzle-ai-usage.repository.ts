import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { and, count, eq, excluded, resolveExecutor, sql } from "@packages/drizzle";
import type { LlmFeature } from "@packages/llm/contract/language-model.port";
import { aiUsage } from "../../../schemas/assistant.schema";
import type { AssistantError } from "../../application/errors/assistant-errors";
import type {
  FamilyCostSpread,
  IAiUsageRepository,
} from "../../application/ports/ai-usage-repository.port";
import type { FeatureUsage, MonthlyUsage } from "../../domain/usage/quota-policy";
import { InstrumentedStore } from "./instrumented-store";

const familyCost = sql<number>`sum(${aiUsage.costMicroUsd})`.mapWith(Number);

export class DrizzleAiUsageRepository extends InstrumentedStore implements IAiUsageRepository {
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleAiUsageRepository");
  }

  async monthOf(
    userId: string,
    month: string,
  ): Promise<Result<MonthlyUsage<LlmFeature>, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("monthOf", async () => {
      const rows = await this.run(
        exec
          .select({
            feature: aiUsage.feature,
            calls: aiUsage.calls,
            escalations: aiUsage.escalations,
            costMicroUsd: aiUsage.costMicroUsd,
          })
          .from(aiUsage)
          .where(and(eq(aiUsage.userId, userId), eq(aiUsage.month, month))),
      );

      return Result.ok(Object.fromEntries(rows.map(({ feature, ...used }) => [feature, used])));
    });
  }

  async add(
    userId: string,
    month: string,
    feature: LlmFeature,
    increment: FeatureUsage,
  ): Promise<Result<void, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("add", async () => {
      await this.run(
        exec
          .insert(aiUsage)
          .values({ userId, month, feature, ...increment })
          .onConflictDoUpdate({
            target: [aiUsage.userId, aiUsage.month, aiUsage.feature],
            set: {
              calls: sql`${aiUsage.calls} + ${excluded(aiUsage.calls)}`,
              escalations: sql`${aiUsage.escalations} + ${excluded(aiUsage.escalations)}`,
              costMicroUsd: sql`${aiUsage.costMicroUsd} + ${excluded(aiUsage.costMicroUsd)}`,
            },
          }),
      );
      return Result.ok();
    });
  }

  async familiesFrom(
    month: string,
    costMicroUsd: number,
  ): Promise<Result<string[], AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("familiesFrom", async () => {
      const rows = await this.run(
        exec
          .select({ userId: aiUsage.userId })
          .from(aiUsage)
          .where(eq(aiUsage.month, month))
          .groupBy(aiUsage.userId)
          .having(sql`${familyCost} >= ${costMicroUsd}`),
      );

      return Result.ok(rows.map(({ userId }) => userId));
    });
  }

  async costSpread(month: string): Promise<Result<FamilyCostSpread, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("costSpread", async () => {
      const totals = exec
        .select({ total: familyCost.as("total") })
        .from(aiUsage)
        .where(eq(aiUsage.month, month))
        .groupBy(aiUsage.userId)
        .as("totals");
      const percentile = (share: number) =>
        sql<number>`coalesce(percentile_cont(${share}) within group (order by ${totals.total}), 0)`.mapWith(
          Number,
        );
      const rows = await this.run(
        exec
          .select({
            families: count(),
            p50MicroUsd: percentile(0.5),
            p95MicroUsd: percentile(0.95),
          })
          .from(totals),
      );

      return Result.ok(rows[0] ?? { families: 0, p50MicroUsd: 0, p95MicroUsd: 0 });
    });
  }
}
