import type { ExtractionCategoryValue } from "./value-objects/extraction-category.vo";

export const EXTRACTED_TITLE_MAX = 120;
export const EXTRACTED_DESCRIPTION_MAX = 300;

export type ExtractionConfidence = "high" | "medium" | "low";

export type ReviewReason =
  | "low_confidence"
  | "weekday_mismatch"
  | "date_before_publication"
  | "date_too_far"
  | "quote_not_in_text"
  | "relative_holiday";

export interface ExtractedEvent {
  title: string;
  description: string;
  category: ExtractionCategoryValue;
  deadlineDate: string;
  deadlineTime?: string;
  confidence: ExtractionConfidence;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
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
