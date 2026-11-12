import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { type EventFilters, eventPagesQueryOptions } from "../../../shared/api/queries/events";
import { isInWeek } from "../week";

const WHOLE_FAMILY: EventFilters = { category: null, childId: null };

export function useWeekEvents(now: Date) {
  const query = useInfiniteQuery(eventPagesQueryOptions("upcoming", WHOLE_FAMILY));
  const last = query.data?.pages.at(-1)?.items.at(-1);
  const weekGoesOn =
    query.hasNextPage &&
    !query.isFetchingNextPage &&
    !query.isFetchNextPageError &&
    last !== undefined &&
    isInWeek(last.deadlineDate, now);
  const { fetchNextPage } = query;

  useEffect(() => {
    if (weekGoesOn) void fetchNextPage();
  }, [weekGoesOn, fetchNextPage]);

  return query;
}
