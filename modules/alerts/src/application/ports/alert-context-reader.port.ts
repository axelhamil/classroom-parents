import type { AppError, Result } from "@packages/ddd-kit";

export interface AlertContext {
  alertId: string;
  email: string;
  eventTitle: string;
  childLabel: string;
  deadlineLabel: string;
  eventUrl: string;
}

export interface IAlertContextReader {
  load(alertIds: string[]): Promise<Result<AlertContext[], AppError>>;
}
