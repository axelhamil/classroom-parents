import type { Option, Result } from "@packages/ddd-kit";
import type { AlertsError, DeliveryChannel } from "./alert-repository.port";

export interface AccessLossChild {
  userId: string;
  childId: string;
}

export interface AccessLossLease {
  accessAlertId: string;
  attempts: number;
}

export interface ClaimedAccessLoss extends AccessLossChild {
  lease: AccessLossLease;
  failures: number;
}

export interface ClosedAccessLoss {
  accessAlertId: string;
  cancelled: boolean;
}

export type AccessLossSettlement =
  | { status: "sent"; channel: DeliveryChannel; at: Date }
  | { status: "missed" }
  | { status: "cancelled"; at: Date };

export interface IAccessLossRepository {
  open(child: AccessLossChild, dueAt: Date): Promise<Result<Option<string>, AlertsError>>;

  close(child: AccessLossChild, at: Date): Promise<Result<ClosedAccessLoss[], AlertsError>>;

  claimDue(
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<Result<ClaimedAccessLoss[], AlertsError>>;

  settle(
    lease: AccessLossLease,
    settlement: AccessLossSettlement,
  ): Promise<Result<boolean, AlertsError>>;

  addFailure(lease: AccessLossLease): Promise<Result<boolean, AlertsError>>;
}
