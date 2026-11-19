import { type IInstrumentation, Result } from "@packages/ddd-kit";
import { DAY_MS } from "@packages/ddd-kit/days";
import { count, gte, resolveExecutor, sql } from "@packages/drizzle";
import { aiCall } from "@packages/llm/schemas/ai-call.schema";
import type { AssistantError } from "../../application/errors/assistant-errors";
import type { CallOutcomes, IAiSpendReader } from "../../application/ports/ai-spend-reader.port";
import type { DailySpend } from "../../domain/usage/daily-spend";
import { InstrumentedStore } from "./instrumented-store";

const SPEND_WINDOW_DAYS = 7;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const spentSince = (from: Date) =>
  sql<number>`coalesce(sum(${aiCall.costMicroUsd}) filter (where ${aiCall.createdAt} >= ${from}), 0)`.mapWith(
    Number,
  );

export class DrizzleAiSpendReader extends InstrumentedStore implements IAiSpendReader {
  constructor(instrumentation: IInstrumentation) {
    super(instrumentation, "DrizzleAiSpendReader");
  }

  async dailySpend(now: Date): Promise<Result<DailySpend, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("dailySpend", async () => {
      const today = startOfUtcDay(now);
      const windowStart = new Date(today.getTime() - SPEND_WINDOW_DAYS * DAY_MS);
      const rows = await this.run(
        exec
          .select({ today: spentSince(today), window: spentSince(windowStart) })
          .from(aiCall)
          .where(gte(aiCall.createdAt, windowStart)),
      );
      const spend = rows[0] ?? { today: 0, window: 0 };

      return Result.ok({
        todayMicroUsd: spend.today,
        previousSevenDaysMicroUsd: spend.window - spend.today,
      });
    });
  }

  async outcomesSince(since: Date): Promise<Result<CallOutcomes, AssistantError>> {
    const exec = resolveExecutor();
    return this.guarded("outcomesSince", async () => {
      const rows = await this.run(
        exec
          .select({
            calls: count(),
            outputInvalid: count(sql`case when ${aiCall.outcome} = 'output_invalid' then 1 end`),
          })
          .from(aiCall)
          .where(gte(aiCall.createdAt, since)),
      );

      return Result.ok(rows[0] ?? { calls: 0, outputInvalid: 0 });
    });
  }
}
