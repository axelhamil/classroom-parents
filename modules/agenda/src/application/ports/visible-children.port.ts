import type { AppError, Result } from "@packages/ddd-kit";

export interface IVisibleChildren {
  idsOf(userId: string): Promise<Result<string[], AppError>>;
}
