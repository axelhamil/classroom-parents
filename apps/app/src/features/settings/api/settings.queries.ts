import { throwApiError, toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import { authClient } from "../../../shared/auth/auth-client";

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

export function sessionsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["sessions", userId] as const,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient.listSessions({ fetchOptions: { signal } });
      if (error) throw toAuthClientError(error, errorFallback("loadSessions"));
      return data;
    },
  });
}
