import type { AppError, Result } from "@packages/ddd-kit";

export interface PlannedDeadline {
  eventId: string;
  userId: string;
  deadlineDate: string;
  deadlineTime?: string;
}

export interface IAlertPlanner {
  planDefault(deadline: PlannedDeadline): Promise<Result<void, AppError>>;

  replan(deadline: PlannedDeadline): Promise<Result<void, AppError>>;

  cancel(eventId: string): Promise<Result<void, AppError>>;
}
