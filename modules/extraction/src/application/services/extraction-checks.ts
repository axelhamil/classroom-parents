import { Option } from "@packages/ddd-kit";
import { DAY_MS, weekdayOf } from "@packages/ddd-kit/days";
import {
  EVIDENCE_CONTEXT_MAX,
  EVIDENCE_QUOTE_MAX,
  type ReviewReason,
} from "@packages/events/agenda-contract";
import type { ExtractedCandidate } from "./extraction-output.schema";
import { FRENCH_MONTHS, FRENCH_WEEKDAYS, withoutMarks } from "./french-calendar";

export interface CheckContext {
  source: string;
  publishedOn: string;
}

const MAX_DAYS_AHEAD = 400;
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

interface IndexedText {
  text: string;
  starts: number[];
  ends: number[];
}

function normalizedChar(char: string): string {
  const folded = withoutMarks(char.normalize("NFKC").toLowerCase())
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[«»“”„"]/g, " ");

  return folded.replace(/\s+/g, " ");
}

function normalizedWithOffsets(text: string): IndexedText {
  const indexed: IndexedText = { text: "", starts: [], ends: [] };
  let offset = 0;

  for (const char of text) {
    for (const folded of normalizedChar(char)) {
      const blank = folded === " " && (indexed.text === "" || indexed.text.endsWith(" "));
      if (blank) continue;

      indexed.text += folded;
      indexed.starts.push(offset);
      indexed.ends.push(offset + char.length);
    }
    offset += char.length;
  }

  if (indexed.text.endsWith(" ")) {
    indexed.text = indexed.text.slice(0, -1);
    indexed.starts.pop();
    indexed.ends.pop();
  }

  return indexed;
}

function normalizeForMatch(text: string): string {
  return normalizedWithOffsets(text).text;
}

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);

  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / DAY_MS;
}

export function frenchWeekdayOf(isoDate: string): string {
  return FRENCH_WEEKDAYS[weekdayOf(isoDate)] ?? "";
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

export interface Span {
  start: number;
  end: number;
}

const SENTENCE_BREAK = /[.!?…]+\s+|\n+/g;
const HAS_WORD = /[\p{L}\p{N}]/u;

export function locateQuote(quote: string, source: string): Option<Span> {
  const wanted = normalizeForMatch(quote);
  const indexed = normalizedWithOffsets(source);
  const at = wanted === "" ? -1 : indexed.text.indexOf(wanted);
  if (at === -1) return Option.none();

  const start = indexed.starts[at] ?? 0;
  const end = indexed.ends[at + wanted.length - 1] ?? start;

  return Option.some({ start, end: start + cappedLength(source.slice(start, end)) });
}

function cappedLength(passage: string): number {
  if (passage.length <= EVIDENCE_QUOTE_MAX) return passage.length;

  const cut = passage.slice(0, EVIDENCE_QUOTE_MAX + 1).lastIndexOf(" ");

  return cut > 0 ? passage.slice(0, cut).trimEnd().length : EVIDENCE_QUOTE_MAX;
}

export function sentenceBefore(source: string, start: number): string {
  const head = source.slice(0, start);
  const starts = [0, ...Array.from(head.matchAll(SENTENCE_BREAK), (m) => m.index + m[0].length)];
  const from = starts.findLast((index) => HAS_WORD.test(head.slice(index))) ?? start;
  const before = head.slice(from);
  if (before.length <= EVIDENCE_CONTEXT_MAX) return before;

  const tail = before.slice(-EVIDENCE_CONTEXT_MAX);

  return tail.slice(Math.max(0, tail.search(/\s/)));
}

export function sentenceAfter(source: string, end: number): string {
  const rest = source.slice(end);
  const breaks = Array.from(rest.matchAll(SENTENCE_BREAK), (m) => m.index + m[0].trimEnd().length);
  const to = breaks.find((index) => HAS_WORD.test(rest.slice(0, index))) ?? rest.length;
  const after = rest.slice(0, to);
  if (after.length <= EVIDENCE_CONTEXT_MAX) return after;

  const head = after.slice(0, EVIDENCE_CONTEXT_MAX + 1);

  return head.slice(0, Math.max(0, head.lastIndexOf(" ")));
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
