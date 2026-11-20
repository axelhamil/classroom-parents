import type { AppError, Result } from "@packages/ddd-kit";

export interface EventSummary {
  title: string;
  childId: string;
}

export interface IEventSummaries {
  summariesOf(
    userId: string,
    eventIds: string[],
  ): Promise<Result<Map<string, EventSummary>, AppError>>;
}
