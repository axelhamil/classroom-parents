import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { unreadCountQueryOptions } from "../notifications/notifications.queries";

export function appBadgeCount(queryClient: QueryClient): number | undefined {
  return queryClient.getQueryData(unreadCountQueryOptions.queryKey);
}

function showOnIcon(count: number): void {
  const shown = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();

  void shown.catch(() => undefined);
}

/** Shows on the app icon the unread count of the notification center, as the server counts it. */
export function useAppBadge(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;

    let shown: number | undefined;
    const refresh = () => {
      const count = appBadgeCount(queryClient);
      if (count === undefined || count === shown) return;

      shown = count;
      showOnIcon(count);
    };

    refresh();
    return queryClient.getQueryCache().subscribe(refresh);
  }, [queryClient]);
}
