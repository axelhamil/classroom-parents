import { Option } from "@packages/ddd-kit";
import { CalendarFeed, type CalendarFeedProps } from "../domain/calendar-feed.aggregate";
import { CalendarFeedId } from "../domain/calendar-feed-id";
import { FeedScope } from "../domain/value-objects/feed-scope.vo";
import { FeedSecretHash } from "../domain/value-objects/feed-secret-hash.vo";

export const PARENT = "parent-1";
export const CHILD = "0196a000-0000-7000-8000-0000000000c1";
export const OTHER_CHILD = "0196a000-0000-7000-8000-0000000000c2";
export const FEED_ID = "0196a000-0000-7000-8000-0000000000f1";
export const OLD_HASH = "a".repeat(64);

export function feedSecretHash(value: string): FeedSecretHash {
  return FeedSecretHash.create(value).getValue();
}

export function calendarFeed(overrides: Partial<CalendarFeedProps> = {}): CalendarFeed {
  return CalendarFeed.reconstitute(
    {
      userId: PARENT,
      secretHash: feedSecretHash(OLD_HASH),
      scope: FeedScope.fromChildIds(Option.none()).getValue(),
      createdAt: new Date("2026-11-01T08:00:00.000Z"),
      rotatedAt: Option.none(),
      lastFetchedAt: Option.none(),
      ...overrides,
    },
    CalendarFeedId.parse(FEED_ID).getValue(),
  );
}
