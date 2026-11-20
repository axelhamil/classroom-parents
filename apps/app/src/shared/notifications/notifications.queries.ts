import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api/api-client";

export const NOTIFICATIONS_KEY = ["notifications"] as const;

const NOTIFICATIONS_PAGE_SIZE = 20;

const $list = api.notifications.$get;
const $unreadCount = api.notifications["unread-count"].$get;

export type NotificationPage = InferResponseType<typeof $list, 200>;

export type NotificationItem = NotificationPage["notifications"][number];

export type NotificationContent = NotificationItem["content"];

export const notificationPagesQueryOptions = infiniteQueryOptions({
  queryKey: [...NOTIFICATIONS_KEY, "feed"] as const,
  initialPageParam: null as string | null,
  queryFn: async ({ pageParam, signal }): Promise<NotificationPage> => {
    const res = await $list(
      {
        query: {
          limit: String(NOTIFICATIONS_PAGE_SIZE),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      },
      { init: { signal } },
    );
    if (!res.ok) await throwApiError(res, "loadNotifications");
    return res.json();
  },
  getNextPageParam: (page) => page.nextCursor,
});

export const unreadCountQueryOptions = queryOptions({
  queryKey: [...NOTIFICATIONS_KEY, "unread-count"] as const,
  queryFn: async ({ signal }): Promise<number> => {
    const res = await $unreadCount({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadUnreadCount");
    return (await res.json()).count;
  },
});
