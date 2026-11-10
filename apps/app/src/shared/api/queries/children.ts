import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $list = api.children.$get;

export type ChildDto = InferResponseType<typeof $list, 200>[number];

export const childrenQueryOptions = queryOptions({
  queryKey: ["children"] as const,
  queryFn: async ({ signal }): Promise<ChildDto[]> => {
    const res = await $list({}, { init: { signal } });
    if (!res.ok) await throwApiError(res, "loadChildren");
    return res.json();
  },
});
