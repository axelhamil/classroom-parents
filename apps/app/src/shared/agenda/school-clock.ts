import { isWeekday, shiftDate } from "@packages/ddd-kit/days";
import { PARIS_TIME_ZONE, utcToZonedWall } from "@packages/ddd-kit/zoned-time";

/** The hour a school day is over: the home turns to the next school day, and the greeting to the evening. */
export const SCHOOL_DAY_ENDS_AT = "16:00";

const LONGEST_BREAK_DAYS = 120;

export type Greeting = "morning" | "evening";

export interface SchoolClockSettings {
  timeZone: string;
  closedDays: ReadonlySet<string>;
}

/** Every date the home reads for one instant: computed once, so no two blocks disagree on "today" or "tomorrow". */
export interface SchoolClock {
  now: Date;
  today: string;
  time: string;
  focus: string;
  tonightFor: string;
  greeting: Greeting;
  closedDays: ReadonlySet<string>;
}

export const DEFAULT_CLOCK_SETTINGS: SchoolClockSettings = {
  timeZone: PARIS_TIME_ZONE,
  closedDays: new Set(),
};

interface Wall {
  date: string;
  time: string;
}

function wallOf(now: Date, timeZone: string): Wall {
  const wall = utcToZonedWall(now, timeZone);
  if (wall.isSuccess) return wall.getValue();

  const iso = now.toISOString();

  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function isSchoolDay(date: string, closedDays: ReadonlySet<string>): boolean {
  return isWeekday(date) && !closedDays.has(date);
}

/** The first school day after `date`, past weekends, holidays and bank holidays. */
export function nextSchoolDay(date: string, closedDays: ReadonlySet<string>): string {
  for (let offset = 1; offset <= LONGEST_BREAK_DAYS; offset += 1) {
    const day = shiftDate(date, offset);
    if (isSchoolDay(day, closedDays)) return day;
  }

  return shiftDate(date, 1);
}

/**
 * The school day the home looks at, `focus`: today until the end of a school day, then the next
 * school day. `tonightFor` is the day the evening prepares, which is `focus` once the day is over.
 */
export function schoolClock(
  now: Date,
  { timeZone, closedDays }: SchoolClockSettings = DEFAULT_CLOCK_SETTINGS,
): SchoolClock {
  const { date: today, time } = wallOf(now, timeZone);
  const dayIsOver = time >= SCHOOL_DAY_ENDS_AT;
  const focus =
    isSchoolDay(today, closedDays) && !dayIsOver ? today : nextSchoolDay(today, closedDays);

  return {
    now,
    today,
    time,
    focus,
    tonightFor: focus === today ? nextSchoolDay(today, closedDays) : focus,
    greeting: dayIsOver ? "evening" : "morning",
    closedDays,
  };
}
