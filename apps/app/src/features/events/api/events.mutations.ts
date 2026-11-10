import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $confirm = api.events[":id"].confirm.$post;
const $delete = api.events[":id"].$delete;
const $edit = api.events[":id"].$patch;
const $customizeReminders = api.events[":eventId"].reminders.$put;
const $resetReminders = api.events[":eventId"].reminders.$delete;

type EventReminders = InferRequestType<typeof $customizeReminders>["json"]["reminders"];
export type EventPatch = InferRequestType<typeof $edit>["json"];

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

export const customizeEventRemindersMutationOptions = mutationOptions({
  mutationKey: ["events", "reminders", "customize"] as const,
  mutationFn: async ({ eventId, reminders }: { eventId: string; reminders: EventReminders }) => {
    const res = await $customizeReminders({ param: { eventId }, json: { reminders } });
    if (!res.ok) await throwApiError(res, "customizeEventReminders");
    return res.json();
  },
});

export const resetEventRemindersMutationOptions = mutationOptions({
  mutationKey: ["events", "reminders", "reset"] as const,
  mutationFn: async (eventId: string): Promise<void> => {
    const res = await $resetReminders({ param: { eventId } });
    if (!res.ok) await throwApiError(res, "resetEventReminders");
  },
});

export const editEventMutationOptions = mutationOptions({
  mutationKey: ["events", "edit"] as const,
  mutationFn: async ({ eventId, patch }: { eventId: string; patch: EventPatch }) => {
    const res = await $edit({ param: { id: eventId }, json: patch });
    if (!res.ok) await throwApiError(res, "editEvent");
    return res.json();
  },
});
