/** Languages a school writes in, with the regional Arabic variants whose month names differ. */
const SCHOOL_LOCALES = [
  ...["fr", "en", "es", "pt", "pt-PT"],
  ...["ar", "ar-MA", "ar-DZ", "ar-TN", "ar-SY", "ar-IQ"],
] as const;

const A_SUNDAY = Date.UTC(2026, 10, 1);
const DAY_MS = 86_400_000;
const ARABIC_ARTICLE = "ال";
const SHORTEST_NAME = 3;

const EXTRA_WEEKDAYS: Record<string, number> = {
  tues: 2,
  weds: 3,
  thur: 4,
  thurs: 4,
};

const EASTERN_ZEROS = [0x660, 0x6f0];
const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Strips diacritics, hamza marks and accents: what a teacher may or may not type. */
export function withoutMarks(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Arabic-Indic and Persian digits as ASCII digits, one character for one, so an offset in the
 * result is an offset in the input. NFKC leaves them as they are.
 */
export function withWesternDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/gu, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    const zero = EASTERN_ZEROS.find((start) => code >= start && code <= start + 9) ?? code;

    return String(code - zero);
  });
}

/** The form every calendar comparison reads: lower case, no mark, ASCII digits. */
export function foldedCalendarText(text: string): string {
  return withWesternDigits(withoutMarks(text.normalize("NFKC").toLowerCase()));
}

function namesOf(option: "weekday" | "month", width: "long" | "short", dates: readonly Date[]) {
  return SCHOOL_LOCALES.flatMap((locale) => {
    const format = new Intl.DateTimeFormat(locale, { [option]: width, timeZone: "UTC" });

    return dates.map((date, index) => ({ name: format.format(date), index }));
  });
}

function writtenForms(name: string): string[] {
  const folded = foldedCalendarText(name).replace(/\.$/, "");
  const [head = folded] = folded.split("-");
  const bare = folded.startsWith(ARABIC_ARTICLE) ? folded.slice(ARABIC_ARTICLE.length) : folded;

  return [folded, head, bare];
}

function nameTable(entries: readonly { name: string; index: number }[]): Map<string, number> {
  const table = new Map<string, number>();
  for (const { name, index } of entries)
    for (const form of writtenForms(name))
      if (Array.from(form).length >= SHORTEST_NAME) table.set(form, index);

  return table;
}

const WEEK = Array.from({ length: 7 }, (_, day) => new Date(A_SUNDAY + day * DAY_MS));
const YEAR = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2026, month, 15)));

const LONG_WEEKDAYS = nameTable(namesOf("weekday", "long", WEEK));
const LONG_MONTHS = nameTable(
  namesOf("month", "long", YEAR).map(({ name, index }) => ({ name, index: index + 1 })),
);

function withoutClashes(short: Map<string, number>, other: Map<string, number>) {
  return new Map([...short].filter(([name]) => !other.has(name)));
}

const SHORT_WEEKDAYS = nameTable(namesOf("weekday", "short", WEEK));
const SHORT_MONTHS = nameTable(
  namesOf("month", "short", YEAR).map(({ name, index }) => ({ name, index: index + 1 })),
);

/**
 * Weekday names a school may write, folded, to their day (0 is Sunday): the long and short
 * names `Intl` gives for every school language, Portuguese without "-feira", Arabic without its
 * article. A short name that is also a month name somewhere ("mar") is left out.
 */
export const WEEKDAY_NAMES: ReadonlyMap<string, number> = new Map([
  ...withoutClashes(SHORT_WEEKDAYS, new Map([...LONG_MONTHS, ...SHORT_MONTHS])),
  ...Object.entries(EXTRA_WEEKDAYS),
  ...LONG_WEEKDAYS,
]);

/** Full weekday names only: an abbreviation like "qui" or "ter" is also an ordinary word. */
export const FULL_WEEKDAY_NAMES: ReadonlyMap<string, number> = LONG_WEEKDAYS;

/** Month names a school may write, folded, to their month (1 is January), Maghreb and Levant forms included. */
export const MONTH_NAMES: ReadonlyMap<string, number> = new Map([
  ...withoutClashes(SHORT_MONTHS, new Map([...LONG_WEEKDAYS, ...SHORT_WEEKDAYS])),
  ...LONG_MONTHS,
]);

/** Full weekday and month names only, for a search that must not fire on a short word like "set". */
export const FULL_CALENDAR_NAMES: readonly string[] = [
  ...LONG_WEEKDAYS.keys(),
  ...LONG_MONTHS.keys(),
];

const ENGLISH_WEEKDAY = new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" });

/** The English name of the weekday of an ISO day, for the context the model reads. */
export function englishWeekdayOf(isoDate: string): string {
  return ENGLISH_WEEKDAY.format(new Date(`${isoDate}T12:00:00Z`));
}

/** Which number comes first in a numeric date like 11/12. */
export type DateOrder = "day-month" | "month-day";

/**
 * The order the schools of a country write a numeric date in, read from `Intl` for the main
 * language of that country (11/26 in the United States, 26/11 in Morocco or in the United
 * Kingdom). An unknown or invalid country has no order: the code cannot settle 11/12 for it.
 */
export function dateOrderOf(country: string | null): DateOrder | null {
  if (country === null || !COUNTRY_CODE.test(country)) return null;

  const { language } = new Intl.Locale("und", { region: country }).maximize();
  const parts = new Intl.DateTimeFormat(`${language}-${country}`, {
    day: "numeric",
    month: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(Date.UTC(2026, 10, 26)));
  const first = parts.find((part) => part.type === "day" || part.type === "month");

  return first?.type === "month" ? "month-day" : "day-month";
}
