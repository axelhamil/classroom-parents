import type { AppError, Result } from "@packages/ddd-kit";

export interface ChildToSync {
  childId: string;
  userId: string;
  label: string;
  lease: number;
}

export interface IDueChildren {
  claimDue(limit: number, now: Date): Promise<Result<ChildToSync[], AppError>>;
}
