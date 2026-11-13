import { toAuthClientError } from "@packages/web-kit/api/errors/api-error";
import { errorFallback } from "@packages/web-kit/i18n/get-errors-t";
import { queryOptions } from "@tanstack/react-query";
import { authClient } from "../../../shared/auth/auth-client";

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
