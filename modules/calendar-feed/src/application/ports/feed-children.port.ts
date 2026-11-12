import type { AppError, Result } from "@packages/ddd-kit";

export interface IFeedChildren {
  idsOf(userId: string): Promise<Result<string[], AppError>>;
}
