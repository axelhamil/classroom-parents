import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../api-client";

const $request = api.me.delete.$post;

type RequestResponse = InferResponseType<typeof $request, 200>;

export const requestAccountDeletionMutationOptions = mutationOptions({
  mutationKey: ["account-deletion", "request"] as const,
  mutationFn: async (): Promise<RequestResponse> => {
    const res = await $request();
    if (!res.ok) await throwApiError(res, "requestAccountDeletion");
    return res.json();
  },
});
