import type { AppError, Result } from "@packages/ddd-kit";

export interface AlertDeadline {
  date: string;
  time?: string | undefined;
  today: string;
}

export interface AlertContext {
  alertId: string;
  email: string;
  eventTitle: string;
  childLabel: string;
  deadline: AlertDeadline;
  eventUrl: string;
}

export interface IAlertContextReader {
  load(alertIds: string[]): Promise<Result<AlertContext[], AppError>>;
}
