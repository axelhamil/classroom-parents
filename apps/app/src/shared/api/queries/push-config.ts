import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $config = api.push.config.$get;

export const pushConfigQueryOptions = queryOptions({
  queryKey: ["push", "config"] as const,
  queryFn: async ({ signal }) => {
    const res = await $config({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadPushConfig");
    return res.json();
  },
  staleTime: Number.POSITIVE_INFINITY,
});
