import type { ReviewReason } from "../../domain/extracted-event";
import type { ExtractedCandidate } from "./extraction-output.schema";

export interface CheckContext {
  source: string;
  publishedOn: string;
}

const MAX_DAYS_AHEAD = 400;
const DAY_MS = 86_400_000;
const FRENCH_WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const HOLIDAY_WORDS = /\b(?:vacances|rentree|conges|toussaint|noel|paques)\b/;

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);

  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS;
}

export function frenchWeekdayOf(isoDate: string): string {
  const weekday = new Date(dayNumber(isoDate) * DAY_MS).getUTCDay();

  return FRENCH_WEEKDAYS[weekday] ?? "";
}

function citedWeekdays(expression: string): string[] {
  const words = new Set(expression.split(/[^a-z]+/));

  return FRENCH_WEEKDAYS.filter((weekday) => words.has(weekday));
}

function quotesAreInSource(candidate: ExtractedCandidate, source: string): boolean {
  const quote = normalizeForMatch(candidate.evidenceQuote);
  const expression = normalizeForMatch(candidate.dateExpression);

  return quote !== "" && source.includes(quote) && source.includes(expression);
}

export function reviewReasonsFor(
  candidate: ExtractedCandidate,
  context: CheckContext,
): ReviewReason[] {
  const source = normalizeForMatch(context.source);
  const expression = normalizeForMatch(candidate.dateExpression);
  const weekdays = citedWeekdays(expression);
  const daysAhead = dayNumber(candidate.deadlineDate) - dayNumber(context.publishedOn);

  const checks: [ReviewReason, boolean][] = [
    ["low_confidence", candidate.confidence === "low"],
    [
      "weekday_mismatch",
      weekdays.length > 0 && !weekdays.includes(frenchWeekdayOf(candidate.deadlineDate)),
    ],
    ["date_before_publication", daysAhead < 0],
    ["date_too_far", daysAhead > MAX_DAYS_AHEAD],
    ["quote_not_in_text", !quotesAreInSource(candidate, source)],
    ["relative_holiday", HOLIDAY_WORDS.test(expression)],
  ];

  return checks.filter(([, failed]) => failed).map(([reason]) => reason);
}
