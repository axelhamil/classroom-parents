import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import type { EventCategory } from "../../events/event-labels";
import { api } from "../api-client";

export const EVENTS_PAGE_SIZE = 50;

const $list = api.events.$get;

export type EventItem = InferResponseType<typeof $list, 200>["items"][number];

export type EventScope = "upcoming" | "history";

export interface EventFilters {
  category: EventCategory | null;
  childId: string | null;
}

export function eventFilterQuery(filters: EventFilters) {
  return {
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.childId ? { childId: filters.childId } : {}),
  };
}

export function eventPagesQueryOptions(scope: EventScope, filters: EventFilters) {
  return infiniteQueryOptions({
    queryKey: ["events", scope, filters] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: {
            scope,
            limit: String(EVENTS_PAGE_SIZE),
            ...eventFilterQuery(filters),
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadEvents");
      return res.json();
    },
    getNextPageParam: (page) => page.nextCursor ?? null,
  });
}
