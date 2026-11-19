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

/** Longest stretch of the announcement kept on each side of the quoted passage, so the parent reads it in context. */
export const EVIDENCE_CONTEXT_MAX = 200;

/**
 * The passage of an announcement a deadline was read from, exactly as written (child names and contacts masked):
 * `start` and `end` bound it in the Classroom text (NFC), `before` and `after` are the sentences around it.
 */
export interface EvidencePassage {
  quote: string;
  start: number;
  end: number;
  before: string;
  after: string;
}

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
  "injection_suspected",
] as const;

export type ReviewReason = (typeof REVIEW_REASONS)[number];

/** What a parent has to do for a deadline besides being there: pay, sign, hand back or bring. */
export const PARENT_ACTION_KINDS = ["pay", "sign", "return", "bring"] as const;

export type ParentActionKind = (typeof PARENT_ACTION_KINDS)[number];

/** Currencies a written amount is read in; an amount in another currency is kept without its sum. */
export const ACTION_CURRENCIES = ["EUR", "MAD"] as const;

export type ActionCurrency = (typeof ACTION_CURRENCIES)[number];

/** Longest label of a parent action or of an item to bring. */
export const PARENT_ACTION_LABEL_MAX = 80;

/** Most parent actions, and most items to bring, kept for one deadline. */
export const PARENT_ACTIONS_MAX = 8;

/**
 * One thing the announcement asks the parent to do, with the passage that says so (exactly as
 * written, names and contacts masked). `amountCents` is read by code in that passage, never
 * written by the model: `null` when the passage holds no amount.
 */
export interface ParentAction {
  kind: ParentActionKind;
  label: string;
  amountCents: number | null;
  currency: ActionCurrency | null;
  quote: string;
}

/** An object the announcement names for the pupil to bring, with the passage naming it. */
export interface ItemToBring {
  item: string;
  quote: string;
}
