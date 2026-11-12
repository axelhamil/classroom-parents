import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { InferRequestType } from "hono/client";
import { api } from "../api-client";

const $setQuietHours = api.reminders["quiet-hours"].$put;

export type QuietHours = InferRequestType<typeof $setQuietHours>["json"];

export const setQuietHoursMutationOptions = mutationOptions({
  mutationKey: ["reminders", "quiet-hours", "set"] as const,
  mutationFn: async (quiet: QuietHours) => {
    const res = await $setQuietHours({ json: quiet });
    if (!res.ok) await throwApiError(res, "setQuietHours");
    return res.json();
  },
});
