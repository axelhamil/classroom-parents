import type { AppError, Result } from "@packages/ddd-kit";

export interface AlertEmailContent {
  alertId: string;
  version: number;
  eventTitle: string;
  childLabel: string;
  deadlineLabel: string;
  eventUrl: string;
}

export interface IAlertEmailSender {
  send(to: string, content: AlertEmailContent): Promise<Result<void, AppError>>;
}
