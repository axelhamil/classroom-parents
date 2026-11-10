import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { type EventFilters, eventFilterQuery } from "../../../shared/api/queries/events";

const $list = api.events.$get;
const $get = api.events[":id"].$get;
const $alert = api.events[":eventId"].alert.$get;

export type EventAlert = InferResponseType<typeof $alert, 200>["alert"];

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
            ...eventFilterQuery(filters),
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
