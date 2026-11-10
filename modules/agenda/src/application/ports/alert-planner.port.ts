import type { AppError, Result } from "@packages/ddd-kit";

export interface PlannedDeadline {
  eventId: string;
  userId: string;
  actorUserId: string | null;
}

export interface IAlertPlanner {
  planDefault(deadline: PlannedDeadline): Promise<Result<void, AppError>>;

  replan(deadline: PlannedDeadline): Promise<Result<void, AppError>>;

  cancel(eventId: string, actorUserId: string | null): Promise<Result<void, AppError>>;
}
