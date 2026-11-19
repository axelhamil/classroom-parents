import type { Result } from "@packages/ddd-kit";
import type { SyncError } from "../sync-error";

export interface ParentChild {
  childId: string;
  label: string;
}

export interface IParentChildren {
  childrenOf(userId: string): Promise<Result<ParentChild[], SyncError>>;
}
