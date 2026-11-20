import { FULL_CALENDAR_NAMES, foldedCalendarText, MONTH_NAMES } from "./calendar-words";

export interface WrittenDate {
  day: number;
  month: number;
  year?: number;
}

const ORDINAL = "(?:er|re|st|nd|rd|th|o|a)?";
const NO_LETTER_BEFORE = "(?<![\\p{L}\\p{N}])";
const NO_LETTER_AFTER = "(?![\\p{L}\\p{N}])";

function alternation(names: readonly string[]): string {
  return names
    .toSorted((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

const MONTH = alternation([...MONTH_NAMES.keys()]);
const FULL_MONTH = alternation(
  [...MONTH_NAMES.keys()].filter((name) => FULL_CALENDAR_NAMES.includes(name)),
);
const SHORT_MONTH = alternation(
  [...MONTH_NAMES.keys()].filter((name) => !FULL_CALENDAR_NAMES.includes(name)),
);

const DAY_THEN_MONTH = new RegExp(
  `${NO_LETTER_BEFORE}(\\d{1,2})${ORDINAL}\\s+(?:de\\s+)?(${MONTH})\\.?${NO_LETTER_AFTER}(?:\\s+(?:de\\s+)?(\\d{4}))?`,
  "gu",
);

const MONTH_THEN_DAY = new RegExp(
  `${NO_LETTER_BEFORE}(${FULL_MONTH}|(?:${SHORT_MONTH})(?=\\.))\\.?\\s+(\\d{1,2})${ORDINAL}${NO_LETTER_AFTER}(?:,?\\s+(\\d{4}))?`,
  "gu",
);

const NUMERIC_DATE = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?\b/g;

function fullYear(written: string | undefined): number | undefined {
  if (written === undefined) return undefined;

  const year = Number(written);
  return written.length === 2 ? 2000 + year : year;
}

function dateOf(day: string | undefined, month: number, year: string | undefined): WrittenDate {
  const date = { day: Number(day), month };
  const fullYearOf = fullYear(year);

  return fullYearOf === undefined ? date : { ...date, year: fullYearOf };
}

function isCalendarDay({ day, month }: WrittenDate): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function spelled(text: string): WrittenDate[] {
  const dayFirst = [...text.matchAll(DAY_THEN_MONTH)].map(([, day, month, year]) =>
    dateOf(day, MONTH_NAMES.get(month ?? "") ?? 0, year),
  );
  const monthFirst = [...text.matchAll(MONTH_THEN_DAY)].map(([, month, day, year]) =>
    dateOf(day, MONTH_NAMES.get(month ?? "") ?? 0, year),
  );

  return [...dayFirst, ...monthFirst];
}

function numeric(text: string): WrittenDate[] {
  return [...text.matchAll(NUMERIC_DATE)].flatMap(([, first, second, year]) => {
    const dayFirst = dateOf(first, Number(second), year);
    const monthFirst = dateOf(second, Number(first), year);

    return first === second ? [dayFirst] : [dayFirst, monthFirst];
  });
}

/**
 * The calendar days an announcement writes out, in any school language: a day and a month name
 * ("26 novembre", "26 de noviembre", "November 26", "Nov. 26", "26 نونبر"), a month written first
 * only in full or abbreviated with a dot, since "set 2" is also an ordinary phrase, or a numeric date in both its
 * day first and month first readings, since the school's country is not known here, with the
 * year when it is written. Whether a day is past is the caller's call.
 */
export function writtenDates(text: string): WrittenDate[] {
  const folded = foldedCalendarText(text);

  return [...numeric(folded), ...spelled(folded)].filter(isCalendarDay);
}
