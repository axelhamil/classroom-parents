import { z } from "zod";
import { defineEventContribution } from "../contribution";

export const syncEvents = defineEventContribution({
  types: {
    ANNOUNCEMENT_SYNCED: "classroom.announcements.synced",
  },
  payloads: {
    "classroom.announcements.synced": z.object({
      userId: z.string(),
      childId: z.string(),
      newAnnouncements: z.number().int().nonnegative(),
      eventsCreated: z.number().int().nonnegative(),
      actorUserId: z.null(),
    }),
  },
  retention: {
    "classroom.announcements.synced": "operational",
  },
  visibility: {
    "classroom.announcements.synced": "public",
  },
  descriptions: {
    "classroom.announcements.synced":
      "A child's Classroom announcements were read and their new deadlines extracted.",
  },
});
