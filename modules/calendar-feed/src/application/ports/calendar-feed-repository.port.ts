import type { AppError, Option, Result } from "@packages/ddd-kit";
import type { CalendarFeed } from "../../domain/calendar-feed.aggregate";
import type { FeedSecretHash } from "../../domain/value-objects/feed-secret-hash.vo";

export type CalendarFeedError = AppError<
  | "CALENDAR_FEED_NOT_FOUND"
  | "CALENDAR_FEED_SCOPE_INVALID"
  | "CALENDAR_FEED_CHILD_NOT_FOUND"
  | "CALENDAR_FEED_PROVIDER_FAILURE"
>;

export interface ICalendarFeedRepository {
  lockOwned(userId: string): Promise<Result<Option<CalendarFeed>, CalendarFeedError>>;

  findOwned(userId: string): Promise<Result<Option<CalendarFeed>, CalendarFeedError>>;

  findBySecretHash(
    secretHash: FeedSecretHash,
  ): Promise<Result<Option<CalendarFeed>, CalendarFeedError>>;

  insertIfAbsent(feed: CalendarFeed): Promise<Result<boolean, CalendarFeedError>>;

  save(feed: CalendarFeed): Promise<Result<void, CalendarFeedError>>;

  recordFetch(feed: CalendarFeed): Promise<Result<void, CalendarFeedError>>;

  deleteOwned(userId: string): Promise<Result<Option<string>, CalendarFeedError>>;
}
