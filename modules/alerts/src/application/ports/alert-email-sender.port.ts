import type { AppError, Result } from "@packages/ddd-kit";
import type { AlertDeadline } from "./alert-context-reader.port";

export interface AlertEmailContent {
  alertId: string;
  version: number;
  eventTitle: string;
  childLabel: string;
  deadline: AlertDeadline;
  eventUrl: string;
}

export interface AlertGroupEmailContent {
  groupKey: string;
  items: Pick<AlertEmailContent, "eventTitle" | "childLabel" | "deadline">[];
  appUrl: string;
}

export interface DigestEmailContent {
  digestId: string;
  summary: string;
  appUrl: string;
}

export interface AccessLossEmailContent {
  accessAlertId: string;
  childLabel: string;
  childrenUrl: string;
}

export interface IAlertEmailSender {
  send(to: string, content: AlertEmailContent): Promise<Result<void, AppError>>;

  sendGroup(to: string, content: AlertGroupEmailContent): Promise<Result<void, AppError>>;

  sendDigest(to: string, content: DigestEmailContent): Promise<Result<void, AppError>>;

  sendAccessLoss(to: string, content: AccessLossEmailContent): Promise<Result<void, AppError>>;
}
