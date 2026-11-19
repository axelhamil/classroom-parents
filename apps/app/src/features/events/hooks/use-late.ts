import { useQuery } from "@tanstack/react-query";
import type { SchoolClock } from "../../../shared/agenda/school-clock";
import { olderLateCount, overdueView } from "../../../shared/agenda/views";
import { lateBacklogQueryOptions } from "../api/events.queries";
import { useHomeEvents } from "./use-home-events";

/** The late deadlines of the late window and how many older ones wait in the history: one count for every surface. */
export function useLate(clock: SchoolClock, childId: string | null) {
  const query = useHomeEvents(clock);
  const backlog = useQuery(lateBacklogQueryOptions(childId));

  return {
    isSuccess: query.isSuccess,
    loaded: query.data ?? [],
    late: overdueView(query.data ?? [], clock, childId),
    older: olderLateCount(backlog.data ?? [], clock),
  };
}
