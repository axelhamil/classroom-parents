import type { AppError, Option, Result } from "@packages/ddd-kit";

export interface AccessLossContext {
  email: string;
  childLabel: string;
}

export interface IAccessLossContextReader {
  stillLost(userId: string, childId: string): Promise<Result<Option<AccessLossContext>, AppError>>;
}
