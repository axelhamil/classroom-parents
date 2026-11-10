import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $linkable = api.children.linkable.$get;
const $linkConfig = api.children["link-config"].$get;
const $events = api.events.$get;

export type LinkableAccount = InferResponseType<typeof $linkable, 200>[number];
export type LinkConfig = InferResponseType<typeof $linkConfig, 200>;

export const linkableAccountsQueryOptions = queryOptions({
  queryKey: ["children", "linkable"] as const,
  queryFn: async ({ signal }): Promise<LinkableAccount[]> => {
    const res = await $linkable({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadLinkableAccounts");
    return res.json();
  },
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
});

export const linkConfigQueryOptions = queryOptions({
  queryKey: ["children", "link-config"] as const,
  queryFn: async ({ signal }): Promise<LinkConfig> => {
    const res = await $linkConfig({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadLinkConfig");
    return res.json();
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export function firstEventQueryOptions(childId: string, synced: boolean) {
  return queryOptions({
    queryKey: ["events", "first-of-child", childId] as const,
    enabled: synced,
    queryFn: async ({ signal }) => {
      const res = await $events(
        { query: { scope: "upcoming", childId, limit: "1" } },
        { init: { signal } },
      );
      if (!res.ok) await throwApiError(res, "loadFirstEvent");
      const page = await res.json();
      return page.items[0] ?? null;
    },
  });
}
