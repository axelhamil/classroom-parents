import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../../../shared/api/api-client";

const $preflight = api.me.delete.preflight.$get;

export function deletionPreflightQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["account-deletion", "preflight", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $preflight({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "preflightDeletion");
      return res.json();
    },
    staleTime: 0,
  });
}
