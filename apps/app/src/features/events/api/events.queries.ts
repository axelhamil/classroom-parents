import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";
import { type EventFilters, eventFilterQuery } from "../../../shared/api/queries/events";

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
