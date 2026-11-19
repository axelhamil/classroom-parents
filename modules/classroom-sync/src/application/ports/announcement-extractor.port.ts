import type { AppError, Result } from "@packages/ddd-kit";
import type { EvidencePassage, ItemToBring, ParentAction } from "@packages/events/agenda-contract";

export interface ExtractionRequest {
  userId: string;
  announcementId: string;
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
  parentActions: ParentAction[];
  toBring: ItemToBring[];
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

export const READING_PAUSED_CODE = "ANNOUNCEMENT_READING_DISABLED";

export function isReadingPaused({ code }: AppError): boolean {
  return code === READING_PAUSED_CODE;
}
