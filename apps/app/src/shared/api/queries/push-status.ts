import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../api-client";

const $status = api.push.status.$get;

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

/** Whether at least one device of the parent receives reminders now; false until the status answers. */
export function usePushLive(userId: string): boolean {
  return (useQuery(pushStatusQueryOptions(userId)).data?.live ?? 0) > 0;
}
