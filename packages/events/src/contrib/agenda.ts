import { z } from "zod";
import { defineEventContribution } from "../contribution";

const EventRef = z.object({ userId: z.string(), eventId: z.string() });

export const agendaEvents = defineEventContribution({
  types: {
    EVENT_CREATED: "agenda.event.created",
    EVENT_ADDED: "agenda.event.added",
    EVENT_UPDATED: "agenda.event.updated",
    EVENT_DELETED: "agenda.event.deleted",
  },
  payloads: {
    "agenda.event.created": EventRef.extend({
      childId: z.string(),
      needsReview: z.boolean(),
      actorUserId: z.null(),
    }),
    "agenda.event.added": EventRef.extend({
      childId: z.string(),
      actorUserId: z.string(),
    }),
    "agenda.event.updated": EventRef.extend({
      fields: z
        .array(
          z.enum(["title", "description", "category", "deadline", "status", "done", "withdrawn"]),
        )
        .min(1),
      actorUserId: z.string().nullable(),
    }),
    "agenda.event.deleted": EventRef,
  },
  retention: {
    "agenda.event.created": "operational",
    "agenda.event.added": "operational",
    "agenda.event.updated": "operational",
    "agenda.event.deleted": "operational",
  },
  visibility: {
    "agenda.event.created": "public",
    "agenda.event.added": "public",
    "agenda.event.updated": "public",
    "agenda.event.deleted": "public",
  },
  descriptions: {
    "agenda.event.created":
      "A school event was extracted from a Classroom announcement into a parent's agenda.",
    "agenda.event.added":
      "A parent added a school event to their agenda by hand, which no sync ever changes.",
    "agenda.event.updated":
      "A parent edited, confirmed or marked done or to do a school event of their agenda, or a sync followed the coursework it comes from.",
    "agenda.event.deleted":
      "A parent deleted a school event, which never comes back on a later sync.",
  },
});
