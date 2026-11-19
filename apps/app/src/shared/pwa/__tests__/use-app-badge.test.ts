import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { CALENDAR_KEY } from "../../api/queries/events";
import { unreadCountQueryOptions } from "../../notifications/notifications.queries";
import { appBadgeCount } from "../use-app-badge";

describe("app badge", () => {
  it("given unread notifications and open deadlines today, then the badge shows the server unread count alone", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(unreadCountQueryOptions.queryKey, 2);
    queryClient.setQueryData(
      [...CALENDAR_KEY, "2026-11-16", "2026-11-22"],
      [{ id: "a", deadlineDate: "2026-11-19", done: false }],
    );

    expect(appBadgeCount(queryClient)).toBe(2);
  });

  it("given the unread count is not known yet, then the badge is left as it is", () => {
    expect(appBadgeCount(new QueryClient())).toBeUndefined();
  });
});
