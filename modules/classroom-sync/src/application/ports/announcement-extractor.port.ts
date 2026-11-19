import type { AppError, Result } from "@packages/ddd-kit";
import type { EvidencePassage } from "@packages/events/agenda-contract";

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
  reviewReasons: string[];
  evidence?: EvidencePassage;
}

export interface ExtractedAmendment {
  kind: "moved" | "cancelled";
  reference: string;
  referenceDate?: string;
}

export interface ExtractedAnnouncement {
  deadlines: ExtractedDeadline[];
  amendments: ExtractedAmendment[];
}

export interface IAnnouncementExtractor {
  extract(request: ExtractionRequest): Promise<Result<ExtractedAnnouncement, AppError>>;
}

const OUTAGE_SUFFIXES = ["_PROVIDER_FAILURE", "_RATE_LIMITED"] as const;

export function isExtractorOutage({ code }: AppError): boolean {
  return OUTAGE_SUFFIXES.some((suffix) => code.endsWith(suffix));
}
