import type { AppError, Result } from "@packages/ddd-kit";

export interface OperatorAlert {
  key: string;
  subject: string;
  lines: string[];
}

export interface IOperatorAlerts {
  notify(alert: OperatorAlert): Promise<Result<void, AppError>>;
}
