import { daysFrom, shiftDate } from "@packages/ddd-kit/days";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
  type SchoolCalendarDays,
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

/**
 * The school clock of this minute for the signed-in parent: their zone's holidays and bank holidays
 * are days off. Until the calendar answers (offline, or in a shape it does not know), weekends are the
 * only days off.
 */
export function useLiveSchoolClock(userId: string): SchoolClock {
  const now = useNow();
  const today = schoolClock(now).today;
  const range = { from: today, to: shiftDate(today, CLOSED_DAYS_AHEAD) };
  const { data } = useQuery(schoolCalendarQueryOptions(userId, range));

  return useMemo(
    () =>
      schoolClock(now, {
        ...DEFAULT_CLOCK_SETTINGS,
        closedDays: data ? closedDaysOf(data) : DEFAULT_CLOCK_SETTINGS.closedDays,
      }),
    [now, data],
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
