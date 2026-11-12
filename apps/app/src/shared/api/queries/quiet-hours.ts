import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $quietHours = api.reminders["quiet-hours"].$get;

export function quietHoursQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["reminders", "quiet-hours", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $quietHours({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadQuietHours");
      return res.json();
    },
  });
}
