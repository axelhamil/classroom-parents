import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $status = api.push.status.$get;
const $defaultReminders = api.reminders.defaults.$get;

export const PUSH_STATUS_KEY = ["push", "status"] as const;

export function pushStatusQueryOptions(userId: string) {
  return queryOptions({
    queryKey: [...PUSH_STATUS_KEY, userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $status({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadPushStatus");
      return res.json();
    },
  });
}

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
