import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $request = api.sync.$post;

type RequestSyncResponse = InferResponseType<typeof $request, 202>;

export const requestSyncMutationOptions = mutationOptions({
  mutationKey: ["sync", "request"] as const,
  mutationFn: async (): Promise<RequestSyncResponse> => {
    const res = await $request();
    if (!res.ok) await throwApiError(res, "requestSync");
    return res.json();
  },
});
