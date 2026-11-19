import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import { api } from "../api-client";

const $markDone = api.events[":id"].done.$post;
const $markUndone = api.events[":id"].done.$delete;

export interface DoneToggle {
  eventId: string;
  done: boolean;
}

export const markEventDoneMutationOptions = mutationOptions({
  mutationKey: ["events", "done"] as const,
  scope: { id: "events-done" },
  mutationFn: async ({ eventId, done }: DoneToggle) => {
    const call = done ? $markDone : $markUndone;
    const res = await call({ param: { id: eventId } });
    if (!res.ok) await throwApiError(res, "markEventDone");
    return res.json();
  },
});
