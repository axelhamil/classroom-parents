import type { AppError, Option, Result } from "@packages/ddd-kit";

export type RgpdError = AppError<
  | "ACCOUNT_DELETION_CANCEL_CONFLICT"
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
  markPendingDeletion(userId: string, until: Date): Promise<Result<boolean, RgpdError>>;

  clearPendingDeletion(userId: string, now: Date): Promise<Result<boolean, RgpdError>>;

  findUsersReadyForWipe(now: Date, limit: number): Promise<Result<PendingDeletionRow[], RgpdError>>;

  executeWipe(
    userId: string,
    recipient: string,
    now: Date,
  ): Promise<Result<ExecuteWipeOutput, RgpdError>>;

  findSessionStart(userId: string, sessionId: string): Promise<Result<Option<Date>, RgpdError>>;

  getUserDeletionState(userId: string): Promise<Result<Option<UserDeletionState>, RgpdError>>;
}
