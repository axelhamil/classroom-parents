import type { ReviewReason } from "../../domain/extracted-event";
import type { ExtractedCandidate } from "./extraction-output.schema";

export interface CheckContext {
  source: string;
  publishedOn: string;
}

const MAX_DAYS_AHEAD = 400;
const DAY_MS = 86_400_000;
const FRENCH_WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const FRENCH_MONTHS = [
  ...["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout"],
  ...["septembre", "octobre", "novembre", "decembre"],
];
const HOLIDAY_WORDS = /\b(?:vacances|rentree|conges|toussaint|noel|paques)\b/;
const ROLLED_FROM_PAST_WINDOW_DAYS = 30;
const WRITTEN_DAY = new RegExp(
  `(?:\\b(${FRENCH_WEEKDAYS.join("|")})\\s+)?\\b(\\d{1,2})(?:er)?(?:\\s+(${FRENCH_MONTHS.join("|")})\\b|\\s*/\\s*(\\d{1,2})\\b)?`,
  "g",
);

interface WrittenDay {
  weekday?: string;
  day: number;
  month?: number;
}

function normalizeForMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[«»“”„"]/g, " ")
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

function partsOf(isoDate: string): Required<WrittenDay> {
  const [, month, day] = isoDate.split("-").map(Number);

  return { weekday: frenchWeekdayOf(isoDate), day: day ?? 0, month: month ?? 0 };
}

function writtenDays(text: string): WrittenDay[] {
  return Array.from(text.matchAll(WRITTEN_DAY)).flatMap(
    ([, weekday, day, monthName, monthNumber]) => {
      const month = monthName ? FRENCH_MONTHS.indexOf(monthName) + 1 : Number(monthNumber);
      if (!weekday && !month) return [];

      return [{ weekday, day: Number(day), month: month || undefined }];
    },
  );
}

function sameDayAndMonth(written: WrittenDay, deadline: Required<WrittenDay>): boolean {
  return written.day === deadline.day && (!written.month || written.month === deadline.month);
}

function contradictsWrittenDays(expression: string, source: string, deadlineDate: string) {
  const deadline = partsOf(deadlineDate);
  const weekdays = citedWeekdays(expression);
  const inExpression = writtenDays(expression);

  const expressionWeekdayDiffers = weekdays.length > 0 && !weekdays.includes(deadline.weekday);
  const expressionDayDiffers =
    inExpression.length > 0 &&
    !inExpression.some(
      (written) =>
        sameDayAndMonth(written, deadline) &&
        (!written.weekday || written.weekday === deadline.weekday),
    );
  const sourceWeekdayDiffers = writtenDays(source).some(
    (written) =>
      written.weekday && sameDayAndMonth(written, deadline) && written.weekday !== deadline.weekday,
  );

  return expressionWeekdayDiffers || expressionDayDiffers || sourceWeekdayDiffers;
}

function rolledFromPast(deadlineDate: string, publishedOn: string): boolean {
  const [year, month, day] = deadlineDate.split("-");
  const yearBefore = `${Number(year) - 1}-${month}-${day}`;
  const daysBefore = dayNumber(publishedOn) - dayNumber(yearBefore);

  return daysBefore > 0 && daysBefore <= ROLLED_FROM_PAST_WINDOW_DAYS;
}

function citedWeekdays(expression: string): string[] {
  const words = new Set(expression.split(/[^a-z]+/));

  return FRENCH_WEEKDAYS.filter((weekday) => words.has(weekday));
}

function quotesAreInSource(candidate: ExtractedCandidate, source: string): boolean {
  const quote = normalizeForMatch(candidate.evidenceQuote);
  const expression = normalizeForMatch(candidate.dateExpression);

  return quote !== "" && expression !== "" && source.includes(quote) && source.includes(expression);
}

export function reviewReasonsFor(
  candidate: ExtractedCandidate,
  context: CheckContext,
): ReviewReason[] {
  const source = normalizeForMatch(context.source);
  const expression = normalizeForMatch(candidate.dateExpression);
  const daysAhead = dayNumber(candidate.deadlineDate) - dayNumber(context.publishedOn);

  const checks: [ReviewReason, boolean][] = [
    ["low_confidence", candidate.confidence === "low"],
    ["weekday_mismatch", contradictsWrittenDays(expression, source, candidate.deadlineDate)],
    [
      "date_before_publication",
      daysAhead < 0 || rolledFromPast(candidate.deadlineDate, context.publishedOn),
    ],
    ["date_too_far", daysAhead > MAX_DAYS_AHEAD],
    ["quote_not_in_text", !quotesAreInSource(candidate, source)],
    ["relative_holiday", HOLIDAY_WORDS.test(expression)],
  ];

  return checks.filter(([, failed]) => failed).map(([reason]) => reason);
}
