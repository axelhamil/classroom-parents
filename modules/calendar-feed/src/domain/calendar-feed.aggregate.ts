import { Aggregate, Option } from "@packages/ddd-kit";
import { CalendarFeedId } from "./calendar-feed-id";
import type { FeedScope } from "./value-objects/feed-scope.vo";
import type { FeedSecretHash } from "./value-objects/feed-secret-hash.vo";

export const FETCH_RECORD_INTERVAL_MS = 3_600_000;

export interface CalendarFeedProps {
  userId: string;
  secretHash: FeedSecretHash;
  scope: FeedScope;
  createdAt: Date;
  rotatedAt: Option<Date>;
  lastFetchedAt: Option<Date>;
}

export interface NewCalendarFeed {
  userId: string;
  secretHash: FeedSecretHash;
  scope: FeedScope;
  now: Date;
}

export class CalendarFeed extends Aggregate<CalendarFeedProps, CalendarFeedId> {
  private constructor(props: CalendarFeedProps, id: CalendarFeedId) {
    super(props, id);
  }

  static create(input: NewCalendarFeed): CalendarFeed {
    return new CalendarFeed(
      {
        userId: input.userId,
        secretHash: input.secretHash,
        scope: input.scope,
        createdAt: input.now,
        rotatedAt: Option.none(),
        lastFetchedAt: Option.none(),
      },
      new CalendarFeedId(),
    );
  }

  static reconstitute(props: CalendarFeedProps, id: CalendarFeedId): CalendarFeed {
    return new CalendarFeed(props, id);
  }

  rotate(secretHash: FeedSecretHash, scope: FeedScope, now: Date): void {
    this._props.secretHash = secretHash;
    this._props.scope = scope;
    this._props.rotatedAt = Option.some(now);
  }

  recordFetch(now: Date): boolean {
    const stale = this._props.lastFetchedAt
      .map((at) => now.getTime() - at.getTime() >= FETCH_RECORD_INTERVAL_MS)
      .unwrapOr(true);
    if (!stale) return false;

    this._props.lastFetchedAt = Option.some(now);
    return true;
  }
}
