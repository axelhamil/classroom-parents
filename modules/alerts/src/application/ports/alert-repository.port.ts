import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { Alert } from "../../domain/alert.aggregate";

export type AlertsError = AppError<
  | "ALERT_NOT_FOUND"
  | "ALERT_AFTER_DEADLINE"
  | "ALERT_IN_PAST"
  | "ALERT_TIME_INVALID"
  | "ALERT_PROVIDER_FAILURE"
  | "PUSH_SUBSCRIPTION_INVALID"
  | "PUSH_PROVIDER_FAILURE"
>;

export const alertNotFound: AlertsError = {
  code: "ALERT_NOT_FOUND",
  message: "Cet événement n'existe pas ou a été supprimé, son alerte ne peut pas être réglée.",
};

export type DeliveryChannel = "push" | "email";

export type DeliveryOutcome = "sent" | "failed";

export interface AlertLease {
  alertId: string;
  attempts: number;
}

export interface ClaimedAlert {
  alert: Alert;
  lease: AlertLease;
}

export interface AlertDelivery {
  alertId: string;
  channel: DeliveryChannel;
  outcome: DeliveryOutcome;
  at: Date;
}

export interface IAlertRepository {
  findOwned(userId: string, eventId: string): Promise<Result<Option<Alert>, AlertsError>>;

  findByEvent(eventId: string): Promise<Result<Option<Alert>, AlertsError>>;

  save(alert: Alert): Promise<Result<void, AlertsError>>;

  claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedAlert[], AlertsError>>;

  settle(alert: Alert, lease: AlertLease): Promise<Result<boolean, AlertsError>>;

  recordDelivery(delivery: AlertDelivery): Promise<Result<void, AlertsError>>;
}
