import type { AppError, Result } from "@packages/ddd-kit";

export interface IChildOwnership {
  isOwnedBy(userId: string, childId: string): Promise<Result<boolean, AppError>>;
}
