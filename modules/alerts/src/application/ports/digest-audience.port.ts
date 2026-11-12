import type { AppError, Option, Result } from "@packages/ddd-kit";

export const DIGEST_ENABLED_BY_DEFAULT = true;

export interface DigestWeek {
  weekStart: string;
  from: Date;
  to: Date;
}

export interface DigestDeadline {
  title: string;
  childId: string;
  childLabel: string;
  deadlineAt: Date;
  deadlineDate: string;
}

export interface IDigestAudience {
  awaiting(week: DigestWeek, limit: number): Promise<Result<string[], AppError>>;

  emailOf(userId: string): Promise<Result<Option<string>, AppError>>;
}

export interface IDigestDeadlines {
  within(userId: string, from: Date, to: Date): Promise<Result<DigestDeadline[], AppError>>;
}
