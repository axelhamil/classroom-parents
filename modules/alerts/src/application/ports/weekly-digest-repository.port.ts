import type { Option, Result } from "@packages/ddd-kit";
import type { AlertsError, DeliveryChannel } from "./alert-repository.port";

export interface DigestLease {
  digestId: string;
  attempts: number;
}

export interface ClaimedDigest {
  lease: DigestLease;
  userId: string;
  weekStart: string;
  expiresAt: Date;
  failures: number;
}

export type DigestSettlement =
  | { status: "sent"; channel: DeliveryChannel; at: Date }
  | { status: "skipped" | "missed" };

export interface IWeeklyDigestRepository {
  plan(userIds: string[], weekStart: string, expiresAt: Date): Promise<Result<number, AlertsError>>;

  claimDue(limit: number, leaseSeconds: number): Promise<Result<ClaimedDigest[], AlertsError>>;

  settle(lease: DigestLease, settlement: DigestSettlement): Promise<Result<boolean, AlertsError>>;

  addFailure(lease: DigestLease): Promise<Result<boolean, AlertsError>>;

  enabledFor(userId: string): Promise<Result<Option<boolean>, AlertsError>>;

  saveEnabled(userId: string, enabled: boolean, at: Date): Promise<Result<void, AlertsError>>;
}
