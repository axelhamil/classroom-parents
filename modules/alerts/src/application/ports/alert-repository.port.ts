import type { AppError, Result } from "@packages/ddd-kit";
import type { Alert } from "../../domain/alert.aggregate";

export type AlertsError = AppError<
  | "ALERT_NOT_FOUND"
  | "ALERT_AFTER_DEADLINE"
  | "ALERT_REMINDER_COUNT_INVALID"
  | "ALERT_REMINDER_DELAY_INVALID"
  | "ALERT_REMINDER_HOURS_INVALID"
  | "ALERT_QUIET_HOURS_INVALID"
  | "ALERT_EVENT_DONE_CONFLICT"
  | "ALERT_EMAIL_INVALID"
  | "ALERT_EMAIL_UNAVAILABLE"
  | "ALERT_PROVIDER_FAILURE"
  | "ALERT_LEASE_CONFLICT"
  | "PUSH_SUBSCRIPTION_INVALID"
  | "PUSH_PROVIDER_FAILURE"
>;

export const alertNotFound: AlertsError = {
  code: "ALERT_NOT_FOUND",
  message: "Cet événement n'existe pas ou a été supprimé, ses rappels ne peuvent pas être réglés.",
};

export type DeliveryChannel = "push" | "email";

export type DeliveryOutcome = "sent" | "failed";

export interface AlertLease {
  alertId: string;
  attempts: number;
  version: number;
}

export interface ClaimedAlert {
  alert: Alert;
  lease: AlertLease;
  failures: number;
}

export interface AlertDelivery {
  alertId: string;
  channel: DeliveryChannel;
  outcome: DeliveryOutcome;
  at: Date;
}

export interface IAlertRepository {
  listOwned(userId: string, eventId: string): Promise<Result<Alert[], AlertsError>>;

  lockOwned(userId: string, eventId: string): Promise<Result<Alert[], AlertsError>>;

  lockByEvent(eventId: string): Promise<Result<Alert[], AlertsError>>;

  lockOwnedMany(userId: string, eventIds: string[]): Promise<Result<Alert[], AlertsError>>;

  saveMany(alerts: Alert[]): Promise<Result<void, AlertsError>>;

  claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedAlert[], AlertsError>>;

  settle(alert: Alert, lease: AlertLease): Promise<Result<boolean, AlertsError>>;

  addFailure(lease: AlertLease): Promise<Result<boolean, AlertsError>>;

  recordDelivery(delivery: AlertDelivery): Promise<Result<void, AlertsError>>;
}
