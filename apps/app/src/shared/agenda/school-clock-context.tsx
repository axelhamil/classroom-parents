import { daysFrom, shiftDate } from "@packages/ddd-kit/days";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  assistantPreferencesQueryOptions,
  parentTimeZoneOf,
} from "../api/queries/assistant-preferences";
import {
  type SchoolCalendarDays,
  type SchoolCalendarRange,
  schoolCalendarQueryOptions,
} from "../api/queries/school-calendar";
import { daysBetween } from "../format/deadline-label";
import { DEFAULT_CLOCK_SETTINGS, type SchoolClock, schoolClock } from "./school-clock";
import { useNow } from "./use-now";

const CLOSED_DAYS_AHEAD = 120;

export function closedDaysOf(calendar: SchoolCalendarDays): ReadonlySet<string> {
  const holidays = calendar.holidays.flatMap(({ startsOn, endsOn }) =>
    daysFrom(startsOn, daysBetween(startsOn, endsOn) + 1),
  );

  return new Set([...holidays, ...calendar.bankHolidays.map(({ date }) => date)]);
}

/** The stretch of the school calendar every surface loads from today, so they all share one request. */
export function schoolCalendarRangeFrom(today: string): SchoolCalendarRange {
  return { from: today, to: shiftDate(today, CLOSED_DAYS_AHEAD) };
}

function useParentTimeZone(userId: string): string {
  const { data } = useQuery({
    ...assistantPreferencesQueryOptions(userId),
    select: parentTimeZoneOf,
  });

  return data ?? DEFAULT_CLOCK_SETTINGS.timeZone;
}

/**
 * The school clock of this minute for the signed-in parent, in the time zone they chose: the
 * holidays and bank holidays of their school calendar are days off. Until the preferences answer (offline, or a zone
 * the browser does not know), the clock runs on Paris time; until the calendar answers (or in a
 * shape it does not know), weekends are the only days off. Neither ever holds the shell back.
 */
export function useLiveSchoolClock(userId: string): SchoolClock {
  const now = useNow();
  const timeZone = useParentTimeZone(userId);
  const today = schoolClock(now, { ...DEFAULT_CLOCK_SETTINGS, timeZone }).today;
  const { data } = useQuery(schoolCalendarQueryOptions(userId, schoolCalendarRangeFrom(today)));

  return useMemo(
    () =>
      schoolClock(now, {
        timeZone,
        closedDays: data ? closedDaysOf(data) : DEFAULT_CLOCK_SETTINGS.closedDays,
      }),
    [now, timeZone, data],
  );
}

const SchoolClockContext = createContext<SchoolClock | null>(null);

interface SchoolClockProviderProps {
  clock: SchoolClock;
  children: ReactNode;
}

export function SchoolClockProvider({ clock, children }: SchoolClockProviderProps) {
  return <SchoolClockContext value={clock}>{children}</SchoolClockContext>;
}

/** The clock the shell ticks; outside the shell (a block rendered alone), the clock of this instant. */
export function useSchoolClock(): SchoolClock {
  return useContext(SchoolClockContext) ?? schoolClock(new Date());
}
