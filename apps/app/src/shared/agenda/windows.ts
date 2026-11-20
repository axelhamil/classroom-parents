import { mondayOf, shiftDate } from "@packages/ddd-kit/days";
import type { SchoolClock } from "./school-clock";

export interface DateRange {
  from: string;
  to: string;
}

/** A named stretch of days. `days` is what its copy says ("14 jours"), so the text and the filter never drift. */
export interface AgendaWindow {
  days: number;
  range: (clock: SchoolClock) => DateRange;
}

const WEEK_DAYS = 7;
const TWO_WEEKS_DAYS = 14;
const LATE_DAYS = 14;
const LONGEST_REQUEST_DAYS = 62;

function ahead(days: number): AgendaWindow {
  return { days, range: ({ today }) => ({ from: today, to: shiftDate(today, days - 1) }) };
}

export const nextSevenDays = ahead(WEEK_DAYS);

export const nextTwoWeeks = ahead(TWO_WEEKS_DAYS);

export const calendarWeek: AgendaWindow = {
  days: WEEK_DAYS,
  range: ({ today }) => {
    const monday = mondayOf(today);

    return { from: monday, to: shiftDate(monday, WEEK_DAYS - 1) };
  },
};

export const lateWindow: AgendaWindow = {
  days: LATE_DAYS,
  range: ({ today }) => ({ from: shiftDate(today, -LATE_DAYS), to: shiftDate(today, -1) }),
};

function later(left: string, right: string): string {
  return [left, right].sort()[1] ?? left;
}

function earlier(left: string, right: string): string {
  return [left, right].sort()[0] ?? left;
}

/**
 * The one range the home loads: every window above and the evening's school day, so each block
 * derives from the same list. Capped to the longest range the server serves; a school day further
 * away (summer) is then not loaded.
 */
export function homeRange(clock: SchoolClock): DateRange {
  const from = lateWindow.range(clock).from;
  const covered = later(nextTwoWeeks.range(clock).to, clock.tonightFor);
  const longest = shiftDate(from, LONGEST_REQUEST_DAYS - 1);

  return { from, to: earlier(covered, longest) };
}
