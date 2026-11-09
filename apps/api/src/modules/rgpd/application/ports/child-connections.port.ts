import type { AppError, Result } from "@packages/ddd-kit";

export interface ChildRevocationTally {
  revoked: number;
  failed: number;
}

export interface IChildConnections {
  revokeAll(userId: string): Promise<Result<ChildRevocationTally, AppError>>;
}
