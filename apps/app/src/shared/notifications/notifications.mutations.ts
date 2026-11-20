import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api/api-client";

const $markRead = api.notifications[":id"].read.$post;
const $markAllRead = api.notifications["read-all"].$post;
const $markReadByRef = api.notifications["read-by-ref"].$post;

export const markNotificationReadMutationOptions = mutationOptions({
  mutationKey: ["notifications", "read"] as const,
  mutationFn: async (id: string): Promise<void> => {
    const res = await $markRead({ param: { id } });
    if (!res.ok) await throwApiError(res, "markNotificationsRead");
  },
});

export const markAllNotificationsReadMutationOptions = mutationOptions({
  mutationKey: ["notifications", "read-all"] as const,
  mutationFn: async (): Promise<number> => {
    const res = await $markAllRead();
    if (!res.ok) await throwApiError(res, "markAllNotificationsRead");
    return (await res.json()).count;
  },
});

export const markNotificationReadByRefMutationOptions = mutationOptions({
  mutationKey: ["notifications", "read-by-ref"] as const,
  mutationFn: async (ref: string): Promise<void> => {
    const res = await $markReadByRef({ json: { ref } });
    if (!res.ok) await throwApiError(res, "markNotificationsRead");
  },
});
