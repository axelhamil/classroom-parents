import { z } from "zod";
import type { CalendarFeed } from "../../domain/calendar-feed.aggregate";

export const FEED_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const issueFeedBodySchema = z.object({
  childIds: z.array(z.string()).optional(),
});

export type IssueFeedInput = z.infer<typeof issueFeedBodySchema>;

export type CalendarFeedStatusDto =
  | { exists: false }
  | {
      exists: true;
      createdAt: string;
      rotatedAt: string | null;
      lastFetchedAt: string | null;
      childIds: string[] | null;
    };

export interface IssuedCalendarFeedDto {
  url: string;
  createdAt: string;
  childIds: string[] | null;
}

export function feedStatusDto(feed: CalendarFeed): CalendarFeedStatusDto {
  return {
    exists: true,
    createdAt: feed.get("createdAt").toISOString(),
    rotatedAt: feed
      .get("rotatedAt")
      .map((at) => at.toISOString())
      .toNull(),
    lastFetchedAt: feed
      .get("lastFetchedAt")
      .map((at) => at.toISOString())
      .toNull(),
    childIds: feed.get("scope").childIds().toNull(),
  };
}
