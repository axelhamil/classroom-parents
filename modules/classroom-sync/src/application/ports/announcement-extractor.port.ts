import type { AppError, Result } from "@packages/ddd-kit";

export interface ExtractionRequest {
  text: string;
  publishedAt: Date;
  childName?: string;
}

export interface ExtractedDeadline {
  title: string;
  description: string;
  category: string;
  deadlineDate: string;
  deadlineTime?: string;
  needsReview: boolean;
}

export interface IAnnouncementExtractor {
  extract(request: ExtractionRequest): Promise<Result<ExtractedDeadline[], AppError>>;
}
