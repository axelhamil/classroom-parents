import type { AppError, Result } from "@packages/ddd-kit";

export interface AlertEmailContent {
  alertId: string;
  version: number;
  eventTitle: string;
  childLabel: string;
  deadlineLabel: string;
  eventUrl: string;
}

export interface DigestEmailContent {
  digestId: string;
  summary: string;
  appUrl: string;
}

export interface IAlertEmailSender {
  send(to: string, content: AlertEmailContent): Promise<Result<void, AppError>>;

  sendDigest(to: string, content: DigestEmailContent): Promise<Result<void, AppError>>;
}
