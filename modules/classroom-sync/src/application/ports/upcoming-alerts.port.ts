import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface IUpcomingAlerts {
  nextAlertAt(
    userId: string,
    childId: string,
    after: Date,
  ): Promise<Result<Option<Date>, AppError>>;
}
