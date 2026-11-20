import { useQuery } from "@tanstack/react-query";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { homeRange } from "../../../shared/agenda/windows";
import { calendarEventsQueryOptions } from "../api/events.queries";

/** The one calendar load every home block derives its view from. */
export function useHomeEvents(clock: SchoolClock) {
  return useQuery(calendarEventsQueryOptions(homeRange(clock)));
}
