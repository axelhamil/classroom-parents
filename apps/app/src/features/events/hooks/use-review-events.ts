import { useQuery } from "@tanstack/react-query";
import { lateBacklogQueryOptions, reviewEventsQueryOptions } from "../api/events.queries";

/** The dates to check, coming and past: the review block and the advice read this one list. */
export function useReviewEvents(childId: string | null) {
  const coming = useQuery(reviewEventsQueryOptions({ category: null, childId }));
  const backlog = useQuery(lateBacklogQueryOptions(childId));

  return {
    coming,
    backlog,
    events: [...(coming.data ?? []), ...(backlog.data ?? [])],
  };
}
