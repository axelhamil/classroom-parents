import { DAY_MS } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";

const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

const RELATIVE_REACH_DAYS = 14;
const NUMERIC_DATE = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{4}|\d{2}))?\b/g;
const WRITTEN_DATE = new RegExp(
  `\\b(\\d{1,2})(?:er)?\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`,
  "g",
);

interface WrittenDate {
  day: number;
  month: number;
  year?: number;
}

function normalized(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function parisDay(instant: Date): string {
  return utcToZonedWall(instant, PARIS_TIME_ZONE)
    .map(({ date }) => date)
    .unwrapOr(instant.toISOString().slice(0, 10));
}

function fullYear(written: string | undefined): number | undefined {
  if (written === undefined) return undefined;

  const year = Number(written);
  return written.length === 2 ? 2000 + year : year;
}

function writtenDates(text: string): WrittenDate[] {
  const numeric = [...text.matchAll(NUMERIC_DATE)].map(([, day, month, year]) => ({
    day: Number(day),
    month: Number(month),
    year: fullYear(year),
  }));
  const spelled = [...text.matchAll(WRITTEN_DATE)].map(([, day, month, year]) => ({
    day: Number(day),
    month: MONTHS.indexOf(month ?? "") + 1,
    year: fullYear(year),
  }));

  return [...numeric, ...spelled].filter(
    ({ day, month }) => day >= 1 && day <= 31 && month >= 1 && month <= 12,
  );
}

function isoDay(year: number, { day, month }: WrittenDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolvedDay(written: WrittenDate, publishedDay: string): string {
  if (written.year !== undefined) return isoDay(written.year, written);

  const publishedYear = Number(publishedDay.slice(0, 4));
  const sameYear = isoDay(publishedYear, written);
  return sameYear >= publishedDay ? sameYear : isoDay(publishedYear + 1, written);
}

export function mayHoldDateAhead(text: string, publishedAt: Date, now: Date): boolean {
  const today = parisDay(now);
  const publishedDay = parisDay(publishedAt);
  const written = writtenDates(normalized(text));
  if (written.length > 0) return written.some((date) => resolvedDay(date, publishedDay) >= today);

  const relativeReach = new Date(publishedAt.getTime() + RELATIVE_REACH_DAYS * DAY_MS);
  return parisDay(relativeReach) >= today;
}
