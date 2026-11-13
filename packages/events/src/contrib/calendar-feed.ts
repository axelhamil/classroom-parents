import { z } from "zod";
import { defineEventContribution } from "../contribution";

const FeedRef = z.object({ userId: z.string(), feedId: z.string() });
const Scope = z.array(z.string()).nullable();

export const calendarFeedEvents = defineEventContribution({
  types: {
    CALENDAR_FEED_CREATED: "calendar.feed.created",
    CALENDAR_FEED_ROTATED: "calendar.feed.rotated",
    CALENDAR_FEED_REVOKED: "calendar.feed.revoked",
  },
  payloads: {
    "calendar.feed.created": FeedRef.extend({ childIds: Scope }),
    "calendar.feed.rotated": FeedRef.extend({ childIds: Scope }),
    "calendar.feed.revoked": FeedRef,
  },
  retention: {
    "calendar.feed.created": "compliance",
    "calendar.feed.rotated": "compliance",
    "calendar.feed.revoked": "compliance",
  },
  visibility: {
    "calendar.feed.created": "public",
    "calendar.feed.rotated": "public",
    "calendar.feed.revoked": "public",
  },
  descriptions: {
    "calendar.feed.created":
      "A parent created the private calendar subscription link that publishes their children's deadlines.",
    "calendar.feed.rotated":
      "A parent replaced their private calendar subscription link; the previous link stopped working.",
    "calendar.feed.revoked":
      "A parent revoked their private calendar subscription link; it no longer serves any deadline.",
  },
});
