import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $reconnect = api.children[":id"].reconnect.$post;
const $disconnect = api.children[":id"].$delete;

type ReconnectedChild = InferResponseType<typeof $reconnect, 200>;

export const reconnectChildMutationOptions = mutationOptions({
  mutationKey: ["children", "reconnect"] as const,
  mutationFn: async (id: string): Promise<ReconnectedChild> => {
    const res = await $reconnect({ param: { id } });
    if (!res.ok) await throwApiError(res, "reconnectChild");
    return res.json();
  },
});

export const disconnectChildMutationOptions = mutationOptions({
  mutationKey: ["children", "disconnect"] as const,
  mutationFn: async (id: string): Promise<void> => {
    const res = await $disconnect({ param: { id } });
    if (!res.ok) await throwApiError(res, "disconnectChild");
  },
});
