import type { Result } from "@packages/ddd-kit";
import type { DailySpend } from "../../domain/usage/daily-spend";
import type { AssistantError } from "../errors/assistant-errors";

export interface CallOutcomes {
  calls: number;
  outputInvalid: number;
}

export interface IAiSpendReader {
  dailySpend(now: Date): Promise<Result<DailySpend, AssistantError>>;

  outcomesSince(since: Date): Promise<Result<CallOutcomes, AssistantError>>;
}
