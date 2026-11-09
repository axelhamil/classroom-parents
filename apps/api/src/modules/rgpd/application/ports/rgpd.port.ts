import type { AppError, Option, Result } from "@packages/ddd-kit";

export type RgpdError = AppError<
  | "ACCOUNT_DELETION_NOT_FOUND"
  | "ACCOUNT_REAUTH_REQUIRED"
  | "ACCOUNT_WIPE_NOTIFY_PROVIDER_FAILURE"
  | "ACCOUNT_WIPE_PROVIDER_FAILURE"
  | "RGPD_REPOSITORY_PROVIDER_FAILURE"
>;

export interface ExecuteWipeOutput {
  alreadyWiped: boolean;
}

export interface PendingDeletionRow {
  userId: string;
  pendingDeletionUntil: Date;
}

export interface UserDeletionState {
  email: string;
  name: string;
  pendingDeletionUntil: Option<Date>;
}

export interface IRgpdRepository {
  markPendingDeletion(userId: string, until: Date): Promise<Result<void, RgpdError>>;

  clearPendingDeletion(userId: string): Promise<Result<void, RgpdError>>;

  findUsersReadyForWipe(now: Date, limit: number): Promise<Result<PendingDeletionRow[], RgpdError>>;

  executeWipe(userId: string): Promise<Result<ExecuteWipeOutput, RgpdError>>;

  findSessionStart(userId: string, sessionId: string): Promise<Result<Option<Date>, RgpdError>>;

  getUserDeletionState(userId: string): Promise<Result<Option<UserDeletionState>, RgpdError>>;
}
