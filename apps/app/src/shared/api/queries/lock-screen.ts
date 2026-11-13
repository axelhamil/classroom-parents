import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $lockScreen = api.push["lock-screen"].$get;

export function lockScreenQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["push", "lock-screen", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $lockScreen({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadLockScreen");
      return (await res.json()).details;
    },
  });
}
