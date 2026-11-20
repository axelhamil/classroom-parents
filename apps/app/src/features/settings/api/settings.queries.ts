import { throwApiError, toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";
import { authClient } from "../../../shared/auth/auth-client";

const $digest = api.reminders.digest.$get;

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

export function digestQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["reminders", "digest", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $digest({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadDigest");
      return (await res.json()).enabled;
    },
  });
}

const $assistantPreferences = api.assistant.preferences.$get;

export function assistantPreferencesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["assistant", "preferences", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $assistantPreferences({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAssistantPreferences");
      return res.json();
    },
  });
}
