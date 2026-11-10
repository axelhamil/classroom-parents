import type { AppError, Result } from "@packages/ddd-kit";

export interface SyncLease {
  childId: string;
  lease: number;
}

export type ReconnectCause = "invalid_grant" | "school_blocked";

export interface IChildSyncState {
  holdsLease(lease: SyncLease): Promise<Result<boolean, AppError>>;

  markSynced(lease: SyncLease, at: Date, nextSyncAt: Date): Promise<Result<void, AppError>>;

  markSyncFailed(lease: SyncLease, nextSyncAt: Date): Promise<Result<void, AppError>>;

  markNeedsReconnect(childId: string, cause: ReconnectCause): Promise<Result<void, AppError>>;
}
