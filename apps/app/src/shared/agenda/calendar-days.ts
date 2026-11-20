import { daysFrom, isWeekday, mondayOf, shiftDate } from "@packages/ddd-kit/days";
import type { EventItem } from "../api/queries/events";
import { courseShortener } from "../format/course-name";
import { daysBetween } from "../format/deadline-label";
import { isDueOn, isOfChild, isOfKind, isOpen } from "./deadline-facts";
import type { SchoolClock } from "./school-clock";
import { DEADLINE_KINDS } from "./views";
import type { DateRange } from "./windows";

type Events = readonly EventItem[];

const CRUNCH_FROM = 3;
const WEEK_DAYS = 7;

export type DayTone = "today" | "past" | "default";

/** What the agenda shows of one day: its deadlines and every count its heading, strip and grid say. */
export interface AgendaDay {
  date: string;
  deadlines: EventItem[];
  tone: DayTone;
  offset: number;
  crunch: boolean;
  summary: AgendaSummary;
}

export interface AgendaSummary {
  count: number;
  assessments: number;
}

/** The deadlines the parent narrowed the agenda to: one child, one course, or all. */
export interface AgendaFilter {
  childId: string | null;
  courseId: string | null;
}

export type AgendaRun =
  | { kind: "day"; day: AgendaDay }
  | { kind: "quiet"; from: string; to: string; days: AgendaDay[] };

export function dayTone(date: string, today: string): DayTone {
  if (date === today) return "today";

  return date < today ? "past" : "default";
}

/** Three open deadlines on today or a day ahead: the day is loaded. A past day no longer warns. */
export function isCrunchDay(
  date: string,
  deadlines: readonly Pick<EventItem, "done">[],
  today: string,
): boolean {
  if (date < today) return false;

  return deadlines.filter(isOpen).length >= CRUNCH_FROM;
}

function isOfCourse(event: Pick<EventItem, "course">, courseId: string | null): boolean {
  return courseId === null || event.course?.id === courseId;
}

export function filterAgenda(events: Events, { childId, courseId }: AgendaFilter): EventItem[] {
  return events.filter((event) => isOfChild(event, childId) && isOfCourse(event, courseId));
}

export function summaryOf(deadlines: Events): AgendaSummary {
  return {
    count: deadlines.length,
    assessments: deadlines.filter((event) => isOfKind(event, DEADLINE_KINDS.assessments)).length,
  };
}

function agendaDay(date: string, events: Events, today: string): AgendaDay {
  const deadlines = events.filter((event) => isDueOn(event, date));

  return {
    date,
    deadlines,
    tone: dayTone(date, today),
    offset: daysBetween(today, date),
    crunch: isCrunchDay(date, deadlines, today),
    summary: summaryOf(deadlines),
  };
}

/** Every day of a period with its deadlines, narrowed by the filter, read against the clock's today. */
export function agendaDaysView(
  days: readonly string[],
  events: Events,
  clock: Pick<SchoolClock, "today">,
  filter: AgendaFilter,
): AgendaDay[] {
  const shown = filterAgenda(events, filter);

  return days.map((date) => agendaDay(date, shown, clock.today));
}

/** The counts of a whole period, for the line under its title and the live announcement. */
export function periodSummaryView(days: readonly AgendaDay[]): AgendaSummary {
  return summaryOf(days.flatMap((day) => day.deadlines));
}

function startsRun(day: AgendaDay, previous: AgendaDay | undefined): boolean {
  return (
    previous === undefined ||
    previous.deadlines.length > 0 ||
    day.tone === "today" ||
    previous.tone === "today" ||
    isWeekday(previous.date) !== isWeekday(day.date)
  );
}

function closeRun(run: AgendaDay[]): AgendaRun | undefined {
  const [first] = run;
  const last = run.at(-1);
  if (first === undefined || last === undefined) return undefined;
  if (run.length === 1) return { kind: "day", day: first };

  return { kind: "quiet", from: first.date, to: last.date, days: run };
}

/**
 * The days of the phone's thread: a day with deadlines stands alone, empty days in a row fold into
 * one line. A fold never crosses today, nor the edge between the school week and the weekend.
 */
export function quietRuns(days: readonly AgendaDay[]): AgendaRun[] {
  const runs: AgendaRun[] = [];
  let quiet: AgendaDay[] = [];

  const flush = () => {
    const run = closeRun(quiet);
    if (run) runs.push(run);
    quiet = [];
  };

  days.forEach((day, index) => {
    if (day.deadlines.length > 0) {
      flush();
      runs.push({ kind: "day", day });
      return;
    }

    if (startsRun(day, days[index - 1])) flush();
    quiet.push(day);
  });
  flush();

  return runs;
}

/** The weeks of the "À venir" list, Monday to Sunday, from the clock's week on. */
export function upcomingWeeks(clock: Pick<SchoolClock, "today">, count: number): DateRange[] {
  const monday = mondayOf(clock.today);

  return Array.from({ length: count }, (_, index) => {
    const from = shiftDate(monday, index * WEEK_DAYS);
    const days = daysFrom(from, WEEK_DAYS);

    return { from, to: days.at(-1) ?? from };
  });
}

/** One course the agenda can narrow to, under the name its line shows. */
export interface AgendaCourse {
  id: string;
  name: string;
}

type Course = NonNullable<EventItem["course"]>;

function coursesOf(events: Events, childId: string): Course[] {
  return events.flatMap((event) =>
    event.childId === childId && event.course ? [event.course] : [],
  );
}

function shortNames(events: Events): Map<string, string> {
  const names = new Map<string, string>();

  for (const childId of new Set(events.map((event) => event.childId))) {
    const courses = coursesOf(events, childId);
    const shorten = courseShortener(courses.map((course) => course.name));
    for (const course of courses) names.set(course.id, shorten(course.name));
  }

  return names;
}

/**
 * The courses of the loaded deadlines, each under its short name; two courses that would read the
 * same keep their full names, so the filter never offers two identical choices.
 */
export function agendaCoursesView(events: Events): AgendaCourse[] {
  const short = shortNames(events);
  const full = new Map(
    events
      .flatMap((event) => (event.course ? [event.course] : []))
      .map((course) => [course.id, course.name]),
  );
  const shortList = [...short.values()];
  const isShared = (name: string) => shortList.filter((other) => other === name).length > 1;

  return [...short]
    .map(([id, name]) => ({ id, name: isShared(name) ? (full.get(id) ?? name) : name }))
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}
