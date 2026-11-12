import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type EventFilters,
  type EventScope,
  eventPagesQueryOptions,
} from "../../../shared/api/queries/events";

const WHOLE_FAMILY: EventFilters = { category: null, childId: null };

export interface WeekRange {
  from: string;
  to: string;
}

export function useWeekEvents(scope: EventScope, { from, to }: WeekRange) {
  const query = useInfiniteQuery(eventPagesQueryOptions(scope, WHOLE_FAMILY));
  const last = query.data?.pages.at(-1)?.items.at(-1);
  const weekGoesOn =
    query.hasNextPage &&
    !query.isFetchingNextPage &&
    !query.isFetchNextPageError &&
    last !== undefined &&
    last.deadlineDate >= from &&
    last.deadlineDate <= to;
  const { fetchNextPage } = query;

  useEffect(() => {
    if (weekGoesOn) void fetchNextPage();
  }, [weekGoesOn, fetchNextPage]);

  return query;
}
