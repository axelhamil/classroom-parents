import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { mutationOptions } from "@tanstack/react-query";
import type { Reminder } from "../../reminders/reminders.schema";
import { api } from "../api-client";

const $setDefaultReminders = api.reminders.defaults.$put;

export const setDefaultRemindersMutationOptions = mutationOptions({
  mutationKey: ["reminders", "defaults", "set"] as const,
  mutationFn: async (reminders: Reminder[]) => {
    const res = await $setDefaultReminders({ json: { reminders } });
    if (!res.ok) await throwApiError(res, "setDefaultReminders");
    return (await res.json()).reminders;
  },
});
