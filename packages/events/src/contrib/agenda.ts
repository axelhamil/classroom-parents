import { z } from "zod";
import { defineEventContribution } from "../contribution";

const EventRef = z.object({ userId: z.string(), eventId: z.string() });

export const agendaEvents = defineEventContribution({
  types: {
    EVENT_CREATED: "agenda.event.created",
    EVENT_ADDED: "agenda.event.added",
    EVENT_UPDATED: "agenda.event.updated",
    EVENT_DELETED: "agenda.event.deleted",
    EVENT_SUPERSEDED: "agenda.event.superseded",
    EVENT_FLAGGED: "agenda.event.flagged",
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
            "evidence",
            "preparation",
          ]),
        )
        .min(1),
      actorUserId: z.string().nullable(),
    }),
    "agenda.event.deleted": EventRef,
    "agenda.event.superseded": EventRef.extend({
      childId: z.string(),
      courseworkEventId: z.string(),
      actorUserId: z.string().nullable(),
    }),
    "agenda.event.flagged": EventRef.extend({
      childId: z.string(),
      reason: z.enum(["moved", "cancelled"]),
      reference: z.string(),
      amendingAnnouncementId: z.string(),
      actorUserId: z.null(),
    }),
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
    "agenda.event.superseded": "operational",
    "agenda.event.flagged": "operational",
    "agenda.events_purged": "operational",
  },
  visibility: {
    "agenda.event.created": "public",
    "agenda.event.added": "public",
    "agenda.event.updated": "public",
    "agenda.event.deleted": "public",
    "agenda.event.superseded": "public",
    "agenda.event.flagged": "public",
    "agenda.events_purged": "public",
  },
  descriptions: {
    "agenda.event.created":
      "A school event was extracted from a Classroom announcement into a parent's agenda.",
    "agenda.event.added":
      "A parent added a school event to their agenda by hand, which no sync ever changes.",
    "agenda.event.updated":
      "A parent edited, confirmed, marked done or to do, or changed the preparation checklist of a school event of their agenda, or a sync followed the coursework it comes from or brought back an event a coursework no longer hides.",
    "agenda.event.deleted":
      "A parent deleted a school event, which never comes back on a later sync.",
    "agenda.event.superseded":
      "An event extracted from an announcement was hidden behind the Classroom coursework naming the same piece of work on the same day; it comes back if that coursework leaves the day.",
    "agenda.event.flagged":
      "A later announcement moved or cancelled an event extracted earlier, so the event went back to review instead of being moved or removed automatically.",
    "agenda.events_purged":
      "The retention sweep erased a parent's events past their retention window, 12 months after the deadline or 30 days after a deletion or withdrawal.",
  },
});
