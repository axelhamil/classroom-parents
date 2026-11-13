import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $defaultReminders = api.reminders.defaults.$get;

export function defaultRemindersQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["reminders", "defaults", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $defaultReminders({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadDefaultReminders");
      return (await res.json()).reminders;
    },
  });
}
