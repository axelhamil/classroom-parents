import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface EventDeadline {
  deadlineAt: Date;
  deadlineDate: string;
  deadlineTime?: string;
}

export interface IEventDeadlines {
  forUser(userId: string, eventId: string): Promise<Result<Option<EventDeadline>, AppError>>;
}
