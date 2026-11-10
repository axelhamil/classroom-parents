import type { AppError, Result } from "@packages/ddd-kit";

export interface ExtractionRequest {
  text: string;
  publishedAt: Date;
  childNames: string[];
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

const OUTAGE_SUFFIXES = ["_PROVIDER_FAILURE", "_RATE_LIMITED"] as const;

export function isExtractorOutage({ code }: AppError): boolean {
  return OUTAGE_SUFFIXES.some((suffix) => code.endsWith(suffix));
}
