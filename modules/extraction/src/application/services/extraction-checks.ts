import { Option } from "@packages/ddd-kit";
import { DAY_MS, weekdayOf } from "@packages/ddd-kit/days";
import {
  EVIDENCE_CONTEXT_MAX,
  EVIDENCE_QUOTE_MAX,
  type ReviewReason,
} from "@packages/events/agenda-contract";
import {
  type DateOrder,
  FULL_WEEKDAY_NAMES,
  foldedCalendarText,
  MONTH_NAMES,
  WEEKDAY_NAMES,
} from "./calendar-words";
import type { ExtractedCandidate } from "./extraction-output.schema";

export interface CheckContext {
  source: string;
  publishedOn: string;
  dateOrder: DateOrder | null;
}

const MAX_DAYS_AHEAD = 400;
const ROLLED_FROM_PAST_WINDOW_DAYS = 30;
const NOT_A_LETTER_BEFORE = "(?<![\\p{L}\\p{N}])";
const NOT_A_LETTER_AFTER = "(?![\\p{L}\\p{N}])";

const HOLIDAY_WORDS = new RegExp(
  `${NOT_A_LETTER_BEFORE}(?:${[
    ...["vacances", "rentree", "conges", "toussaint", "noel", "paques"],
    ...["holiday", "vacation", "half-term", "half term", "christmas", "easter", "thanksgiving"],
    ...["winter break", "spring break", "vacaciones", "navidad", "semana santa", "puente"],
    ...["ferias", "natal", "pascoa", "carnaval", "recesso"],
  ].join("|")})|${["عطلة", "العطلة", "الدخول المدرسي", "العيد"].join("|")}`,
  "u",
);

function alternation(names: Iterable<string>): string {
  return [...names]
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const WEEKDAY = `${NOT_A_LETTER_BEFORE}(${alternation(WEEKDAY_NAMES.keys())})\\.?${NOT_A_LETTER_AFTER}`;
const MONTH = `${NOT_A_LETTER_BEFORE}(${alternation(MONTH_NAMES.keys())})\\.?${NOT_A_LETTER_AFTER}`;
const DAY = "(?<!\\d)(\\d{1,2})(?:er|st|nd|rd|th|º|ª|o)?(?![\\d:h])";
const LINK = "(?:\\s+(?:de|of|del)\\s+|\\s+|\\s*/\\s*)";
const BEFORE_DAY = "[\\s,]+(?:(?:le|el|o|the|dia|يوم)\\s+)?";

const DAY_FIRST = new RegExp(
  `(?:${WEEKDAY}${BEFORE_DAY})?${DAY}(?:${LINK}${MONTH}|\\s*/\\s*(\\d{1,2})(?!\\d))?`,
  "gu",
);
const MONTH_FIRST = new RegExp(`(?:${WEEKDAY}[\\s,]+)?${MONTH}\\s+${DAY}`, "gu");

interface DayAndMonth {
  day: number;
  month?: number;
}

interface WrittenDay extends DayAndMonth {
  weekday?: number;
  otherReading?: DayAndMonth;
  undecided?: boolean;
}

interface IndexedText {
  text: string;
  starts: number[];
  ends: number[];
}

function normalizedChar(char: string): string {
  const folded = foldedCalendarText(char)
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

function partsOf(isoDate: string): Required<DayAndMonth> & { weekday: number } {
  const [, month, day] = isoDate.split("-").map(Number);

  return { weekday: weekdayOf(isoDate), day: day ?? 0, month: month ?? 0 };
}

const isDay = (value: number) => value >= 1 && value <= 31;
const isMonth = (value: number) => value >= 1 && value <= 12;

function numericReading(first: number, second: number, order: DateOrder | null): WrittenDay[] {
  const dayFirst = { day: first, month: second };
  const monthFirst = { day: second, month: first };
  const readings = [dayFirst, monthFirst].filter(({ day, month }) => isDay(day) && isMonth(month));
  if (readings.length === 0) return [];

  const [only] = readings;
  if (readings.length === 1 || first === second) return only ? [only] : [];

  const [preferred, other] =
    order === "month-day" ? [monthFirst, dayFirst] : [dayFirst, monthFirst];

  return [{ ...preferred, otherReading: other, undecided: order === null }];
}

function weekdayNumber(name: string | undefined): number | undefined {
  return name === undefined ? undefined : WEEKDAY_NAMES.get(name);
}

function withWeekday(days: WrittenDay[], weekday: number | undefined): WrittenDay[] {
  return weekday === undefined ? days : days.map((day) => ({ ...day, weekday }));
}

function dayFirstDays(text: string, order: DateOrder | null): WrittenDay[] {
  return Array.from(text.matchAll(DAY_FIRST)).flatMap(
    ([, weekdayName, day, monthName, monthNumber]) => {
      const weekday = weekdayNumber(weekdayName);
      const dayValue = Number(day);
      if (monthNumber !== undefined)
        return withWeekday(numericReading(dayValue, Number(monthNumber), order), weekday);

      const month = monthName === undefined ? undefined : MONTH_NAMES.get(monthName);
      if (!isDay(dayValue) || (weekday === undefined && month === undefined)) return [];

      return [{ weekday, day: dayValue, month }];
    },
  );
}

function monthFirstDays(text: string): WrittenDay[] {
  return Array.from(text.matchAll(MONTH_FIRST)).flatMap(([, weekdayName, monthName, day]) => {
    const month = MONTH_NAMES.get(monthName ?? "");
    const dayValue = Number(day);
    if (month === undefined || !isDay(dayValue)) return [];

    return [{ weekday: weekdayNumber(weekdayName), day: dayValue, month }];
  });
}

function writtenDays(text: string, order: DateOrder | null): WrittenDay[] {
  return [...dayFirstDays(text, order), ...monthFirstDays(text)];
}

function sameDayAndMonth(written: DayAndMonth, deadline: Required<DayAndMonth>): boolean {
  return written.day === deadline.day && (!written.month || written.month === deadline.month);
}

function settledReadings(written: WrittenDay): WrittenDay[] {
  if (written.otherReading === undefined) return [written];

  return [written, { ...written, ...written.otherReading }];
}

function contradictsWrittenDays(
  expression: string,
  source: string,
  deadlineDate: string,
  order: DateOrder | null,
) {
  const deadline = partsOf(deadlineDate);
  const weekdays = citedWeekdays(expression);
  const inExpression = writtenDays(expression, order).flatMap(settledReadings);

  const expressionWeekdayDiffers = weekdays.length > 0 && !weekdays.includes(deadline.weekday);
  const expressionDayDiffers =
    inExpression.length > 0 &&
    !inExpression.some(
      (written) =>
        sameDayAndMonth(written, deadline) &&
        (written.weekday === undefined || written.weekday === deadline.weekday),
    );
  const sourceWeekdayDiffers = writtenDays(source, order).some(
    (written) =>
      !written.undecided &&
      written.weekday !== undefined &&
      sameDayAndMonth(written, deadline) &&
      written.weekday !== deadline.weekday,
  );

  return expressionWeekdayDiffers || expressionDayDiffers || sourceWeekdayDiffers;
}

/**
 * A numeric date both orders can read (11/12) that the school's country does not settle, or
 * that the model read against that country's order: the parent checks it.
 */
function readsAnAmbiguousDate(expression: string, deadlineDate: string, order: DateOrder | null) {
  const deadline = partsOf(deadlineDate);

  return writtenDays(expression, order).some(
    (written) =>
      written.otherReading !== undefined &&
      (written.undecided ||
        (sameDayAndMonth(written.otherReading, deadline) && !sameDayAndMonth(written, deadline))),
  );
}

function rolledFromPast(deadlineDate: string, publishedOn: string): boolean {
  const [year, month, day] = deadlineDate.split("-");
  const yearBefore = `${Number(year) - 1}-${month}-${day}`;
  const daysBefore = dayNumber(publishedOn) - dayNumber(yearBefore);

  return daysBefore > 0 && daysBefore <= ROLLED_FROM_PAST_WINDOW_DAYS;
}

const ABBREVIATED_WEEKDAYS = [...WEEKDAY_NAMES.keys()].filter(
  (name) => !FULL_WEEKDAY_NAMES.has(name),
);
const CITED_WEEKDAY = new RegExp(
  `${NOT_A_LETTER_BEFORE}(?:(${alternation(FULL_WEEKDAY_NAMES.keys())})${NOT_A_LETTER_AFTER}|(${alternation(ABBREVIATED_WEEKDAYS)})(?=\\.|\\s*\\d))`,
  "gu",
);

function citedWeekdays(expression: string): number[] {
  return Array.from(expression.matchAll(CITED_WEEKDAY)).flatMap(
    ([, full, abbreviated]) => weekdayNumber(full ?? abbreviated) ?? [],
  );
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
    [
      "weekday_mismatch",
      contradictsWrittenDays(expression, source, candidate.deadlineDate, context.dateOrder),
    ],
    ["date_ambiguous", readsAnAmbiguousDate(expression, candidate.deadlineDate, context.dateOrder)],
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
