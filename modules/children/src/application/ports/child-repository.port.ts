import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { ChildAccount } from "../../domain/child-account.aggregate";

export type ChildrenError = AppError<
  | "CHILD_NOT_FOUND"
  | "CHILD_ACCOUNT_NOT_LINKED"
  | "CHILD_SCOPES_MISSING"
  | "CHILD_ALREADY_CONNECTED"
  | "CHILD_REFRESH_TOKEN_MISSING"
  | "CHILD_TOKEN_INVALID_GRANT"
  | "CHILD_LABEL_INVALID"
  | "CHILD_PROVIDER_FAILURE"
  | "CHILD_SYNC_BLOCKED"
  | "CHILD_SYNC_LEASE_CONFLICT"
>;

export interface SyncLease {
  childId: string;
  lease: number;
}

export interface DueChild extends SyncLease {
  userId: string;
  label: string;
}

export interface IChildRepository {
  create(child: ChildAccount): Promise<Result<void, ChildrenError>>;

  save(child: ChildAccount): Promise<Result<void, ChildrenError>>;

  findOwned(userId: string, childId: string): Promise<Result<Option<ChildAccount>, ChildrenError>>;

  findForSystem(childId: string): Promise<Result<Option<ChildAccount>, ChildrenError>>;

  findByLinkedAccount(
    userId: string,
    linkedAccountId: string,
  ): Promise<Result<Option<ChildAccount>, ChildrenError>>;

  listForUser(userId: string): Promise<Result<ChildAccount[], ChildrenError>>;

  delete(userId: string, childId: string): Promise<Result<void, ChildrenError>>;

  claimDue(limit: number, now: Date, leaseMs: number): Promise<Result<DueChild[], ChildrenError>>;

  markSynced(lease: SyncLease, at: Date, nextSyncAt: Date): Promise<Result<void, ChildrenError>>;

  markSyncFailed(lease: SyncLease, nextSyncAt: Date): Promise<Result<void, ChildrenError>>;
}
