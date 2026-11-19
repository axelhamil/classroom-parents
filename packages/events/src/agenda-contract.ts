export const CLASSROOM_CATEGORIES = [
  "assessment",
  "homework",
  "school_trip",
  "swimming",
  "document_due",
] as const;

export const EVENT_CATEGORIES = [...CLASSROOM_CATEGORIES, "other"] as const;

export const EVENT_TITLE_MAX = 120;

export const EVENT_DESCRIPTION_MAX = 2000;

export const CHECKLIST_ITEM_MAX = 80;

export const CHECKLIST_ITEMS_MAX = 50;

/** Longest source sentence kept with an extracted deadline, as shown to the parent. */
export const EVIDENCE_QUOTE_MAX = 300;

/** Why an extracted deadline went to review: written by extraction, stored by the agenda, phrased by the app. */
export const REVIEW_REASONS = [
  "low_confidence",
  "weekday_mismatch",
  "date_before_publication",
  "date_too_far",
  "quote_not_in_text",
  "relative_holiday",
  "title_missing",
  "time_unreadable",
  "second_reading_failed",
] as const;

export type ReviewReason = (typeof REVIEW_REASONS)[number];
