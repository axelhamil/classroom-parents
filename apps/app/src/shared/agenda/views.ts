import { daysFrom, shiftDate } from "@packages/ddd-kit/days";
import type { EventItem } from "../api/queries/events";
import type { EventCategory } from "../events/event-labels";
import { hasOpenSteps } from "./checklist-template";
import {
  bySoonest,
  isDueOn,
  isDueWithin,
  isOfChild,
  isOfKind,
  isOpen,
  isOverdue,
  needsReview,
} from "./deadline-facts";
import type { SchoolClock } from "./school-clock";
import {
  type AgendaWindow,
  calendarWeek,
  type DateRange,
  lateWindow,
  nextSevenDays,
  nextTwoWeeks,
} from "./windows";

type Events = readonly EventItem[];

/** The deadlines of one school day and what is left to prepare for it. */
export interface DayPlan {
  day: string;
  deadlines: EventItem[];
  open: EventItem[];
  toPrepare: EventItem[];
  leftToday: EventItem[];
}

export interface DayPlanOptions {
  childId: string | null;
  kept?: ReadonlySet<string>;
}

const NONE_KEPT: ReadonlySet<string> = new Set();

function daysUpTo(clock: SchoolClock, day: string): DateRange {
  const from = day === clock.today ? clock.today : shiftDate(clock.today, 1);

  return { from, to: day };
}

function planOf(
  events: Events,
  range: DateRange,
  childId: string | null,
  kept: ReadonlySet<string>,
) {
  const deadlines = events.filter(
    (event) =>
      isOfChild(event, childId) &&
      isDueWithin(event, range) &&
      (isDueOn(event, range.to) || isOpen(event) || kept.has(event.id)),
  );
  const open = deadlines.filter(isOpen);

  return { day: range.to, deadlines, open, toPrepare: open.filter(hasOpenSteps) };
}

/**
 * The school day the home looks at: its deadlines and those of the days off before it. Once the
 * school day is over, today's unticked deadlines are `leftToday`, never counted for the next day.
 * `kept` holds deadlines ticked while on screen, so a tick never makes a row jump away.
 */
export function dayPlanView(
  events: Events,
  clock: SchoolClock,
  { childId, kept = NONE_KEPT }: DayPlanOptions,
): DayPlan {
  const plan = planOf(events, daysUpTo(clock, clock.focus), childId, kept);
  const dayIsOver = clock.focus !== clock.today;
  const leftToday = dayIsOver
    ? events.filter(
        (event) =>
          isOfChild(event, childId) &&
          isDueOn(event, clock.today) &&
          (isOpen(event) || kept.has(event.id)),
      )
    : [];

  return { ...plan, leftToday };
}

/** What the evening prepares: the next school day, the same one the briefing shows once the day is over. */
export function tonightView(events: Events, clock: SchoolClock, childId: string | null): DayPlan {
  const plan = planOf(events, daysUpTo(clock, clock.tonightFor), childId, NONE_KEPT);

  return { ...plan, leftToday: [] };
}

function openWithin(
  events: Events,
  clock: SchoolClock,
  window: AgendaWindow,
  childId: string | null,
) {
  const range = window.range(clock);

  return events
    .filter((event) => isOfChild(event, childId) && isOpen(event) && isDueWithin(event, range))
    .sort(bySoonest);
}

export function overdueView(
  events: Events,
  clock: SchoolClock,
  childId: string | null,
): EventItem[] {
  const range = lateWindow.range(clock);

  return events
    .filter(
      (event) =>
        isOfChild(event, childId) && isDueWithin(event, range) && isOverdue(event, clock.today),
    )
    .sort((left, right) => bySoonest(right, left));
}

/** Late deadlines older than the late window: never dropped, counted apart. */
export function olderLateCount(backlog: Events, clock: SchoolClock): number {
  const { from } = lateWindow.range(clock);

  return backlog.filter((event) => isOpen(event) && event.deadlineDate < from).length;
}

/** Dates to check, split into coming and past; lists from several loads may overlap, each date counts once. */
export function reviewView(events: Events, clock: SchoolClock) {
  const unique = [...new Map(events.map((event) => [event.id, event])).values()];
  const toReview = unique.filter((event) => isOpen(event) && needsReview(event));

  return {
    upcoming: toReview.filter((event) => event.deadlineDate >= clock.today),
    past: toReview.filter((event) => event.deadlineDate < clock.today),
  };
}

export const DEADLINE_KINDS = {
  assessments: ["assessment"],
  documents: ["document_due"],
  outings: ["school_trip", "swimming"],
} as const satisfies Record<string, readonly EventCategory[]>;

export type DeadlineKind = keyof typeof DEADLINE_KINDS;

/** Open deadlines of one kind over the next two weeks. */
export function upcomingByKind(
  events: Events,
  clock: SchoolClock,
  kind: DeadlineKind,
  childId: string | null,
): EventItem[] {
  return openWithin(events, clock, nextTwoWeeks, childId).filter((event) =>
    isOfKind(event, DEADLINE_KINDS[kind]),
  );
}

export interface ChildAgenda {
  due: EventItem[];
  total: number;
}

/** A child's next seven days: what is still open, out of everything due. */
export function childAgendaView(events: Events, clock: SchoolClock, childId: string): ChildAgenda {
  const range = nextSevenDays.range(clock);
  const all = events.filter((event) => isOfChild(event, childId) && isDueWithin(event, range));

  return { due: all.filter(isOpen), total: all.length };
}

/** The open deadlines whose reminders the home lists. */
export function watchedForReminders(
  events: Events,
  clock: SchoolClock,
  childId: string | null,
): EventItem[] {
  return openWithin(events, clock, nextSevenDays, childId);
}

export interface DayLoad {
  date: string;
  count: number;
  assessments: number;
}

export interface WeekLoad {
  days: string[];
  open: EventItem[];
  loadOf: (childId: string, date: string) => DayLoad;
}

/** Open deadlines per child and per day over the next seven days. */
export function weekLoadView(events: Events, clock: SchoolClock, childId: string | null): WeekLoad {
  const open = openWithin(events, clock, nextSevenDays, childId);

  return {
    days: daysFrom(clock.today, nextSevenDays.days),
    open,
    loadOf: (child, date) => {
      const due = open.filter((event) => event.childId === child && isDueOn(event, date));

      return {
        date,
        count: due.length,
        assessments: due.filter((event) => isOfKind(event, DEADLINE_KINDS.assessments)).length,
      };
    },
  };
}

export interface Progress {
  week: string;
  done: number;
  total: number;
}

/** Deadlines of the calendar week, Monday to Sunday, already done out of all of them. */
export function progressView(events: Events, clock: SchoolClock, childId: string | null): Progress {
  const range = calendarWeek.range(clock);
  const week = events.filter((event) => isOfChild(event, childId) && isDueWithin(event, range));

  return {
    week: range.from,
    done: week.filter((event) => !isOpen(event)).length,
    total: week.length,
  };
}

/**
 * The first open deadline after the school day the home looks at, whatever its status: the
 * "next deadline" of an empty day is never later than what the week shows.
 */
export function nextAfterFocus(
  events: Events,
  clock: SchoolClock,
  childId: string | null,
): EventItem | null {
  const after = events
    .filter(
      (event) => isOfChild(event, childId) && isOpen(event) && event.deadlineDate > clock.focus,
    )
    .sort(bySoonest);

  return after[0] ?? null;
}
