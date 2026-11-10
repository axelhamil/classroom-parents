import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface EventDeadline {
  deadlineAt: Date;
  deadlineDate: string;
  deadlineTime?: string;
  done: boolean;
}

export interface UpcomingDeadline extends EventDeadline {
  eventId: string;
}

export interface IEventDeadlines {
  forUser(userId: string, eventId: string): Promise<Result<Option<EventDeadline>, AppError>>;

  upcomingFor(userId: string, now: Date): Promise<Result<UpcomingDeadline[], AppError>>;
}
