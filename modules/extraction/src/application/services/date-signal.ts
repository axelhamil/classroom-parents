import { withoutMarks } from "./french-calendar";

const SCHOOL_LOCALES = ["fr", "en", "es", "pt", "ar", "ar-MA", "ar-DZ"] as const;
const A_SUNDAY = Date.UTC(2026, 10, 1);
const DAY_MS = 86_400_000;

function folded(text: string): string {
  return withoutMarks(text.normalize("NFKC").toLowerCase());
}

function namesFrom(locale: string, option: "weekday" | "month", dates: readonly Date[]): string[] {
  const format = new Intl.DateTimeFormat(locale, { [option]: "long", timeZone: "UTC" });

  return dates.map((date) => format.format(date));
}

function shortestWrittenForm(name: string): string {
  const [head = name] = folded(name).split("-");

  return head.startsWith("ال") ? head.slice(2) : head;
}

function calendarNames(): string[] {
  const week = Array.from({ length: 7 }, (_, day) => new Date(A_SUNDAY + day * DAY_MS));
  const year = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2026, month, 15)));

  return SCHOOL_LOCALES.flatMap((locale) => [
    ...namesFrom(locale, "weekday", week),
    ...namesFrom(locale, "month", year),
  ]).map(shortestWrittenForm);
}

const WHOLE_WORDS = [
  ...["demain", "jour", "mois", "soir", "tomorrow", "today", "tonight", "next", "week"],
  ...["weekend", "day", "month", "term", "manana", "hoy", "dia", "amanha", "hoje"],
  ...["ghodwa", "ghedwa", "ghadan", "bokra", "lyoum", "simana"],
];

const WORD_STARTS = [
  ...["aujourd", "prochain", "semaine", "trimestre", "vacances", "rentree", "conges"],
  ...["toussaint", "noel", "paques", "fin d", "holiday", "proxim", "semana", "vacaciones"],
  ...["ferias"],
];

const ARABIC_WORDS = [
  ...["غدا", "بكرة", "بكره", "اليوم", "الليلة", "القادم", "المقبل", "الجاي"],
  ...["اسبوع", "يوم", "ايام", "شهر", "عطلة", "الدخول"],
];

const LATIN = /^[a-z ]+$/;

function alternation(words: readonly string[]): string {
  return [...new Set(words.map(folded))].join("|");
}

const CALENDAR_NAMES = calendarNames();

const LATIN_SIGNAL = new RegExp(
  [
    `(?<![\\p{L}\\p{N}])(?:${alternation([...CALENDAR_NAMES.filter((name) => LATIN.test(name)), ...WHOLE_WORDS])})s?(?![\\p{L}\\p{N}])`,
    `(?<![\\p{L}\\p{N}])(?:${alternation(WORD_STARTS)})`,
  ].join("|"),
  "u",
);

const OTHER_SCRIPT_SIGNALS = [
  ...new Set([...CALENDAR_NAMES.filter((name) => !LATIN.test(name)), ...ARABIC_WORDS].map(folded)),
];

const ANY_DIGIT = /\p{Nd}/u;

/**
 * Whether an announcement could hold a deadline: a digit, a weekday or month name, or a
 * relative time word (tomorrow, next week, holidays) in one of the school languages. An
 * announcement with none of them is not sent to the model, the call would cost money to
 * return nothing. Latin words match whole (plural allowed) or by their start ("prochaine"),
 * Arabic words anywhere, since articles and prepositions attach to them.
 */
export function mayHoldADeadline(text: string): boolean {
  const reading = folded(text);
  if (ANY_DIGIT.test(reading)) return true;
  if (LATIN_SIGNAL.test(reading)) return true;

  return OTHER_SCRIPT_SIGNALS.some((word) => reading.includes(word));
}
