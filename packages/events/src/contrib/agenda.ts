import { z } from "zod";
import { defineEventContribution } from "../contribution";

const EventRef = z.object({ userId: z.string(), eventId: z.string() });

export const agendaEvents = defineEventContribution({
  types: {
    EVENT_CREATED: "agenda.event.created",
    EVENT_ADDED: "agenda.event.added",
    EVENT_UPDATED: "agenda.event.updated",
    EVENT_DELETED: "agenda.event.deleted",
    EVENTS_PURGED: "agenda.events_purged",
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
          z.enum([
            "title",
            "description",
            "category",
            "deadline",
            "status",
            "done",
            "withdrawn",
            "checklist",
          ]),
        )
        .min(1),
      actorUserId: z.string().nullable(),
    }),
    "agenda.event.deleted": EventRef,
    "agenda.events_purged": z.object({
      userId: z.string(),
      count: z.number().int().positive(),
      reason: z.literal("retention"),
      scope: z.enum(["past", "dismissed"]),
      actorUserId: z.null(),
    }),
  },
  retention: {
    "agenda.event.created": "operational",
    "agenda.event.added": "operational",
    "agenda.event.updated": "operational",
    "agenda.event.deleted": "operational",
    "agenda.events_purged": "operational",
  },
  visibility: {
    "agenda.event.created": "public",
    "agenda.event.added": "public",
    "agenda.event.updated": "public",
    "agenda.event.deleted": "public",
    "agenda.events_purged": "public",
  },
  descriptions: {
    "agenda.event.created":
      "A school event was extracted from a Classroom announcement into a parent's agenda.",
    "agenda.event.added":
      "A parent added a school event to their agenda by hand, which no sync ever changes.",
    "agenda.event.updated":
      "A parent edited, confirmed, marked done or to do, or changed the preparation checklist of a school event of their agenda, or a sync followed the coursework it comes from.",
    "agenda.event.deleted":
      "A parent deleted a school event, which never comes back on a later sync.",
    "agenda.events_purged":
      "The retention sweep erased a parent's events past their retention window, 12 months after the deadline or 30 days after a deletion or withdrawal.",
  },
});
