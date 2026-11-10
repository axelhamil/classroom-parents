import type { Result } from "@packages/ddd-kit";
import type { SyncError } from "../sync-error";

export type ManualSyncClaim =
  | { outcome: "started"; lease: number; label: string }
  | { outcome: "running" }
  | { outcome: "throttled" };

export interface IManualSyncGate {
  childIdsOf(userId: string): Promise<Result<string[], SyncError>>;

  claim(userId: string, childId: string, now: Date): Promise<Result<ManualSyncClaim, SyncError>>;
}
