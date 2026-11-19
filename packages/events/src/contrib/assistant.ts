import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const assistantEvents = defineEventContribution({
  types: {
    ASSISTANT_PREFERENCE_CHANGED: "assistant.preference.changed",
    ASSISTANT_QUOTA_EXHAUSTED: "assistant.quota.exhausted",
  },
  payloads: {
    "assistant.preference.changed": z.object({
      userId: z.string(),
      locale: z.string().nullable(),
      timeZone: z.string().nullable(),
      country: z.string().nullable(),
      extractionEnabled: z.boolean(),
    }),
    "assistant.quota.exhausted": z.object({
      userId: z.string(),
      feature: z.string(),
      month: z.string(),
      resumesOn: z.iso.date(),
      actorUserId: z.string().nullable(),
    }),
  },
  retention: {
    "assistant.preference.changed": "operational",
    "assistant.quota.exhausted": "operational",
  },
  visibility: {
    "assistant.preference.changed": "public",
    "assistant.quota.exhausted": "internal",
  },
  descriptions: {
    "assistant.preference.changed":
      "A parent chose their language, time zone or country, or switched the AI reading of announcements on or off.",
    "assistant.quota.exhausted":
      "A family used up the monthly allowance of an AI feature; the feature comes back on the first day of the next month.",
  },
});
