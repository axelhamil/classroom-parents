import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { type QueryClient, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import {
  type EventFilters,
  type EventItem,
  eventFilterQuery,
} from "../../../shared/api/queries/events";

const $list = api.events.$get;
const $get = api.events[":id"].$get;
const $reminders = api.events[":eventId"].reminders.$get;
const $calendar = api.events.calendar.$get;
const $feed = api["calendar-feed"].$get;

export type EventReminders = InferResponseType<typeof $reminders, 200>;

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

export function nextEventQueryOptions(childId: string | null) {
  return queryOptions({
    queryKey: ["events", "next", childId] as const,
    queryFn: async ({ signal }) => {
      const res = await $list(
        {
          query: {
            scope: "upcoming",
            status: "confirmed",
            limit: "1",
            ...eventFilterQuery({ category: null, childId }),
          },
        },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadEvents");
      return (await res.json()).items[0] ?? null;
    },
  });
}

export interface CalendarRange {
  from: string;
  to: string;
}

export const CALENDAR_KEY = ["events", "calendar"] as const;

export function calendarEventsQueryOptions({ from, to }: CalendarRange) {
  return queryOptions({
    queryKey: [...CALENDAR_KEY, from, to] as const,
    queryFn: async ({ signal }) => {
      const res = await $calendar({ query: { from, to } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadCalendar");
      return (await res.json()).items;
    },
  });
}

export type CalendarFeedStatus = InferResponseType<typeof $feed, 200>;

export const CALENDAR_FEED_KEY = ["calendar-feed"] as const;

export const calendarFeedQueryOptions = queryOptions({
  queryKey: CALENDAR_FEED_KEY,
  queryFn: async ({ signal }): Promise<CalendarFeedStatus> => {
    const res = await $feed(undefined, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadCalendarFeed");
    return res.json();
  },
});

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

export function eventRemindersQueryOptions(eventId: string) {
  return queryOptions({
    queryKey: ["events", "detail", eventId, "reminders"] as const,
    queryFn: async ({ signal }): Promise<EventReminders> => {
      const res = await $reminders({ param: { eventId } }, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadEventReminders");
      return res.json();
    },
  });
}

type PatchedFields = Pick<EventItem, "done" | "checklist">;

export async function patchCachedEvent(
  queryClient: QueryClient,
  eventId: string,
  patch: (event: PatchedFields) => Partial<PatchedFields>,
): Promise<() => void> {
  const detailKey = eventQueryOptions(eventId).queryKey;
  await queryClient.cancelQueries({ queryKey: CALENDAR_KEY });
  await queryClient.cancelQueries({ queryKey: detailKey });
  const calendars = queryClient.getQueriesData<EventItem[]>({ queryKey: CALENDAR_KEY });
  const detail = queryClient.getQueryData(detailKey);
  queryClient.setQueriesData<EventItem[]>({ queryKey: CALENDAR_KEY }, (items) =>
    items?.map((event) => (event.id === eventId ? { ...event, ...patch(event) } : event)),
  );
  queryClient.setQueryData(detailKey, (event) => event && { ...event, ...patch(event) });

  return () => {
    for (const [key, items] of calendars) queryClient.setQueryData(key, items);
    queryClient.setQueryData(detailKey, detail);
  };
}
