import type { AppError } from "@packages/ddd-kit";

export type SyncError = AppError<
  "SYNC_CHILD_NOT_FOUND" | "SYNC_BLOCKED" | "SYNC_LEASE_CONFLICT" | "SYNC_PROVIDER_FAILURE"
>;
