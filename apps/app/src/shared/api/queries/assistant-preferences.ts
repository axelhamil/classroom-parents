import { throwApiError } from "@packages/web-kit/api/errors/api-error";
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../api-client";

const $assistantPreferences = api.assistant.preferences.$get;

export function assistantPreferencesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: ["assistant", "preferences", userId] as const,
    queryFn: async ({ signal }) => {
      const res = await $assistantPreferences({}, { init: { signal } });
      if (!res.ok) await throwApiError(res, "loadAssistantPreferences");
      return res.json();
    },
  });
}

function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const clockPreferencesSchema = z.object({
  timeZone: z.string().min(1).refine(isKnownTimeZone),
});

/**
 * The zone the parent's school clock runs in, checked on arrival: a zone the browser does not know,
 * or none chosen yet, gives `null` so the clock keeps its default instead of failing.
 */
export function parentTimeZoneOf(preferences: unknown): string | null {
  const parsed = clockPreferencesSchema.safeParse(preferences);

  return parsed.success ? parsed.data.timeZone : null;
}
