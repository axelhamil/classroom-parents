import type { ReviewReason } from "@packages/events/agenda-contract";
import type { ExtractionCategoryValue } from "./value-objects/extraction-category.vo";

export const EXTRACTED_TITLE_MAX = 120;
export const EXTRACTED_DESCRIPTION_MAX = 300;

export type ExtractionConfidence = "high" | "medium" | "low";

export interface ExtractedEvent {
  title: string;
  description: string;
  category: ExtractionCategoryValue;
  deadlineDate: string;
  deadlineTime?: string;
  confidence: ExtractionConfidence;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  evidenceQuote?: string;
}

export const AMENDMENT_KINDS = ["moved", "cancelled"] as const;

export type AmendmentKind = (typeof AMENDMENT_KINDS)[number];

export interface ExtractedAmendment {
  kind: AmendmentKind;
  reference: string;
  referenceDate?: string;
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  amendments: ExtractedAmendment[];
}
