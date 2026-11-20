import type { ReviewReason } from "@packages/events/agenda-contract";
import type { EventItem } from "../../shared/api/queries/events";

type AmendReason = NonNullable<EventItem["amendReason"]>;

const REVIEW_REASON_KEYS = {
  low_confidence: "review.reasons.low_confidence",
  weekday_mismatch: "review.reasons.weekday_mismatch",
  date_before_publication: "review.reasons.date_before_publication",
  date_too_far: "review.reasons.date_too_far",
  quote_not_in_text: "review.reasons.quote_not_in_text",
  relative_holiday: "review.reasons.relative_holiday",
  title_missing: "review.reasons.title_missing",
  time_unreadable: "review.reasons.time_unreadable",
  second_reading_failed: "review.reasons.second_reading_failed",
  injection_suspected: "review.reasons.injection_suspected",
} as const satisfies Record<ReviewReason, string>;

const AMEND_REASON_KEYS = {
  moved: "review.amended.moved",
  cancelled: "review.amended.cancelled",
} as const satisfies Record<AmendReason, string>;

const UNKNOWN_REASON_KEY = "review.reasons.unknown";

type ReviewSentenceKey =
  | (typeof REVIEW_REASON_KEYS)[ReviewReason]
  | (typeof AMEND_REASON_KEYS)[AmendReason]
  | typeof UNKNOWN_REASON_KEY;

export function reviewSentenceKeys(event: EventItem): ReviewSentenceKey[] {
  const amended = event.amendReason ? [AMEND_REASON_KEYS[event.amendReason]] : [];
  const keys = [...amended, ...event.reviewReasons.map((reason) => REVIEW_REASON_KEYS[reason])];

  return keys.length > 0 ? keys : [UNKNOWN_REASON_KEY];
}

export function mainReviewSentenceKey(events: readonly EventItem[]): ReviewSentenceKey {
  const tally = new Map<ReviewSentenceKey, number>();
  for (const key of events.flatMap(reviewSentenceKeys)) tally.set(key, (tally.get(key) ?? 0) + 1);

  const [main] = [...tally].sort(([, left], [, right]) => right - left);

  return main?.[0] ?? UNKNOWN_REASON_KEY;
}
