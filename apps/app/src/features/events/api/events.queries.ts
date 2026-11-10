import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import type { EventCategory } from "../event-labels";

export const EVENTS_PAGE_SIZE = 50;

const $list = api.events.$get;
const $get = api.events[":id"].$get;
const $alert = api.events[":eventId"].alert.$get;

export type EventItem = InferResponseType<typeof $list, 200>["items"][number];
export type EventAlert = InferResponseType<typeof $alert, 200>["alert"];

export interface EventFilters {
  category: EventCategory | null;
  childId: string | null;
}

export function upcomingEventsQueryOptions(filters: EventFilters) {
  return infiniteQueryOptions({
    queryKey: ["events", "upcoming", filters] as const,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const res = await $list(
        {
          query: {
            scope: "upcoming",
            limit: String(EVENTS_PAGE_SIZE),
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.childId ? { childId: filters.childId } : {}),
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

const REVIEW_LIMIT = 100;

export function reviewEventsQueryOptions(filters: EventFilters) {
  return queryOptions({
    queryKey: ["events", "review", filters] as const,
    queryFn: async ({ signal }) => {
      const res = await $list(
        {
          query: {
            scope: "upcoming",
            status: "needs_review",
            limit: String(REVIEW_LIMIT),
            ...(filters.category ? { category: filters.category } : {}),
            ...(filters.childId ? { childId: filters.childId } : {}),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadEvents");
      return (await res.json()).items;
    },
  });
}

export function eventQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: ["events", "detail", eventId] as const,
    queryFn: async ({ signal }) => {
      const res = await $get({ param: { id: eventId } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadEvent");
      return res.json();
    },
  });
}

export function eventAlertQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: ["events", "detail", eventId, "alert"] as const,
    queryFn: async ({ signal }): Promise<EventAlert> => {
      const res = await $alert({ param: { eventId } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadEventAlert");
      return (await res.json()).alert;
    },
  });
}
