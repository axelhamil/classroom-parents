import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../../../shared/api/api-client";

const $confirm = api.events[":id"].confirm.$post;
const $delete = api.events[":id"].$delete;
const $edit = api.events[":id"].$patch;
const $customizeReminders = api.events[":eventId"].reminders.$put;
const $resetReminders = api.events[":eventId"].reminders.$delete;
const $add = api.events.$post;
const $markDone = api.events[":id"].done.$post;
const $markUndone = api.events[":id"].done.$delete;
const $changeChecklist = api.events[":id"].checklist.$post;
const $issueFeed = api["calendar-feed"].$post;
const $revokeFeed = api["calendar-feed"].$delete;

type EventReminders = InferRequestType<typeof $customizeReminders>["json"]["reminders"];
export type EventPatch = InferRequestType<typeof $edit>["json"];
export type NewEvent = InferRequestType<typeof $add>["json"];
export type ChecklistChange = InferRequestType<typeof $changeChecklist>["json"];

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

export const addEventMutationOptions = mutationOptions({
  mutationKey: ["events", "add"] as const,
  mutationFn: async (event: NewEvent) => {
    const res = await $add({ json: event });
    if (!res.ok) await throwApiError(res, "addEvent");
    return res.json();
  },
});

export const changeChecklistMutationOptions = mutationOptions({
  mutationKey: ["events", "checklist"] as const,
  mutationFn: async ({ eventId, change }: { eventId: string; change: ChecklistChange }) => {
    const res = await $changeChecklist({ param: { id: eventId }, json: change });
    if (!res.ok) await throwApiError(res, "changeChecklist");
    return res.json();
  },
});

export const markEventDoneMutationOptions = mutationOptions({
  mutationKey: ["events", "done"] as const,
  mutationFn: async ({ eventId, done }: { eventId: string; done: boolean }) => {
    const call = done ? $markDone : $markUndone;
    const res = await call({ param: { id: eventId } });
    if (!res.ok) await throwApiError(res, "markEventDone");
    return res.json();
  },
});

export const issueCalendarFeedMutationOptions = mutationOptions({
  mutationKey: ["calendar-feed", "issue"] as const,
  mutationFn: async () => {
    const res = await $issueFeed({ json: {} });
    if (!res.ok) await throwApiError(res, "issueCalendarFeed");
    return res.json();
  },
});

export const revokeCalendarFeedMutationOptions = mutationOptions({
  mutationKey: ["calendar-feed", "revoke"] as const,
  mutationFn: async (): Promise<void> => {
    const res = await $revokeFeed();
    if (!res.ok) await throwApiError(res, "revokeCalendarFeed");
  },
});
