import frCatalog from "./catalogs/fr";

const LOCALE = "fr-FR";
const DAY_MS = 86_400_000;
const copy = frCatalog.common.deadline;

type Placeholders<Template extends string> =
  Template extends `${string}{{${infer Name}}}${infer Rest}` ? Name | Placeholders<Rest> : never;

function fill<Template extends string>(
  template: Template,
  values: Record<Placeholders<Template>, string>,
): string {
  const byName: Record<string, string> = values;

  return template.replace(/{{(\w+)}}/g, (match, name: string) => byName[name] ?? match);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

function inSentence(label: string): string {
  return label.toLocaleLowerCase(LOCALE);
}

function daysFrom(today: string, date: string): number {
  return Math.round((utcDay(date) - utcDay(today)) / DAY_MS);
}

/** Midnight UTC of a `YYYY-MM-DD` wall date, in ms: a zone-free day index for day arithmetic. */
export function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/** A `HH:MM[:SS]` wall time as a French reader says it: "8 h 30", "18 h" on the hour. */
export function wallTimeLabel(time: string): string {
  const [hours = "0", minutes = "00"] = time.split(":");
  const hour = String(Number(hours));

  return minutes === "00"
    ? fill(copy.hours, { hours: hour })
    : fill(copy.hoursMinutes, { hours: hour, minutes });
}

/**
 * A wall date as its weekday and date ("jeudi 17 janvier"), lower case, the year spelled out only
 * when it differs from `today`'s. Absolute: it never says today or tomorrow.
 */
export function wallDateLabel(date: string, today: string): string {
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  const format = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });

  return format.format(utcDay(date));
}

/** A day label followed by its wall time when there is one: "Demain, 8 h 30". */
export function withWallTime(day: string, time: string | undefined): string {
  if (!time) return day;

  return fill(copy.dateWithTime, { date: day, time: wallTimeLabel(time) });
}

/**
 * The one label of a deadline's day as a parent reads it relative to `today` (`YYYY-MM-DD` wall
 * dates: the deadline's in the school zone, `today` in the reader's): "Aujourd'hui", "Demain", else the weekday and date with the year
 * only when it differs ("Jeudi 17 janvier", "Mardi 5 janvier 2027"). Capitalized to start a line;
 * a caller lowers it inside a sentence. Every surface that names a deadline's day goes through it,
 * so the same day reads the same everywhere for a same `today`.
 */
export function relativeDayLabel(date: string, today: string): string {
  const daysAhead = daysFrom(today, date);
  if (daysAhead === 0) return copy.today;
  if (daysAhead === 1) return copy.tomorrow;

  return capitalize(wallDateLabel(date, today));
}

/** When a deadline falls (its school wall date and time) and the reader's `today`, all wall values. */
export interface DeadlineWhen {
  date: string;
  time?: string | undefined;
  today: string;
}

/**
 * The relative day and time of a deadline as said inside a sentence, lower case: "demain, 8 h 30",
 * "aujourd'hui", "jeudi 17 janvier". The same words {@link deadlineLine} appends to a line, so a
 * message sentence and a listed line name the same day alike for a same `today`.
 */
export function relativeDeadlineLabel({ date, time, today }: DeadlineWhen): string {
  return inSentence(withWallTime(relativeDayLabel(date, today), time));
}

/**
 * {@link relativeDeadlineLabel} that also keeps the absolute date when the day is relative:
 * "demain, vendredi 20 novembre, 8 h 30". For a text that may be read hours after it was written
 * (an email retried later), so a frozen "demain" is still checkable. A day already written as its
 * date is never written twice: "lundi 23 novembre, 8 h 30".
 */
export function datedDeadlineLabel({ date, time, today }: DeadlineWhen): string {
  const day = relativeDayLabel(date, today);
  const absolute = wallDateLabel(date, today);
  const dated = isRelative(date, today)
    ? fill(copy.relativeWithDate, { day, date: absolute })
    : day;

  return inSentence(withWallTime(dated, time));
}

function isRelative(date: string, today: string): boolean {
  const daysAhead = daysFrom(today, date);

  return daysAhead === 0 || daysAhead === 1;
}

/**
 * What names a deadline on one line; an empty or missing `child` leaves the title alone. `dated`
 * keeps the absolute date next to a relative day, see {@link datedDeadlineLabel}.
 */
interface DeadlineLineInput {
  child?: string | undefined;
  title: string;
  when?: DeadlineWhen | undefined;
  dated?: boolean | undefined;
}

/**
 * The one-line text naming a deadline: "Léa : Exposé", then ", demain, 8 h 30" when `when` is
 * given. Child first, then title, then the relative day and time, always in this order and with
 * these separators, so a shared text, a calendar file and a message name a deadline alike. A text
 * read on later days (a calendar file) omits `when`: a relative word would lie the next day.
 * Markers proper to one surface (a calendar's done mark) stay with that surface.
 */
export function deadlineLine({ child, title, when, dated }: DeadlineLineInput): string {
  const line = child ? fill(copy.childTitle, { child, title }) : title;
  if (!when) return line;

  const label = dated ? datedDeadlineLabel(when) : relativeDeadlineLabel(when);

  return fill(copy.lineWithWhen, { line, when: label });
}
