import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const schoolCalendarEvents = defineEventContribution({
  types: {
    SCHOOL_ZONE_CHANGED: "school_calendar.zone.changed",
  },
  payloads: {
    "school_calendar.zone.changed": z.object({ userId: z.string(), zone: z.string().nullable() }),
  },
  retention: {
    "school_calendar.zone.changed": "operational",
  },
  visibility: {
    "school_calendar.zone.changed": "public",
  },
  descriptions: {
    "school_calendar.zone.changed":
      "A parent chose or cleared the school holiday zone whose holidays and bank holidays they see.",
  },
});
