import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const schoolCalendarEvents = defineEventContribution({
  types: {
    SCHOOL_CALENDAR_CHOICE_CHANGED: "school_calendar.choice.changed",
    SCHOOL_HOLIDAYS_EDITED: "school_calendar.holidays.edited",
  },
  payloads: {
    "school_calendar.choice.changed": z.object({
      userId: z.string(),
      country: z.string().nullable(),
      region: z.string().nullable(),
      source: z.string().nullable(),
    }),
    "school_calendar.holidays.edited": z.object({
      userId: z.string(),
      change: z.enum(["added", "removed", "imported"]),
      origin: z.enum(["ics", "manual"]),
      periods: z.number().int().nonnegative(),
    }),
  },
  retention: {
    "school_calendar.choice.changed": "operational",
    "school_calendar.holidays.edited": "operational",
  },
  visibility: {
    "school_calendar.choice.changed": "public",
    "school_calendar.holidays.edited": "public",
  },
  descriptions: {
    "school_calendar.choice.changed":
      "A parent chose or cleared the school calendar (country, region and source) whose holidays and bank holidays they see.",
    "school_calendar.holidays.edited":
      "A parent added, removed or imported from an iCalendar file their own school holiday periods.",
  },
});
