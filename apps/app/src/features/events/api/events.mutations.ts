import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $confirm = api.events[":id"].confirm.$post;
const $delete = api.events[":id"].$delete;
const $setAlert = api.events[":eventId"].alert.$put;
const $clearAlert = api.events[":eventId"].alert.$delete;

export type AlertTime = InferRequestType<typeof $setAlert>["json"];

export const confirmEventMutationOptions = mutationOptions({
  mutationKey: ["events", "confirm"] as const,
  mutationFn: async (eventId: string) => {
    const res = await $confirm({ param: { id: eventId } });
    if (!res.ok) await throwApiError(res, "confirmEvent");
    return res.json();
  },
});

export const deleteEventMutationOptions = mutationOptions({
  mutationKey: ["events", "delete"] as const,
  mutationFn: async (eventId: string): Promise<void> => {
    const res = await $delete({ param: { id: eventId } });
    if (!res.ok) await throwApiError(res, "deleteEvent");
  },
});

export const setEventAlertMutationOptions = mutationOptions({
  mutationKey: ["events", "alert", "set"] as const,
  mutationFn: async ({ eventId, time }: { eventId: string; time: AlertTime }) => {
    const res = await $setAlert({ param: { eventId }, json: time });
    if (!res.ok) await throwApiError(res, "setEventAlert");
    return res.json();
  },
});

export const clearEventAlertMutationOptions = mutationOptions({
  mutationKey: ["events", "alert", "clear"] as const,
  mutationFn: async (eventId: string): Promise<void> => {
    const res = await $clearAlert({ param: { eventId } });
    if (!res.ok) await throwApiError(res, "clearEventAlert");
  },
});
