import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import { shiftInstant } from "@packages/ddd-kit/days";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { CalendarFeed } from "../../domain/calendar-feed.aggregate";
import { FeedScope } from "../../domain/value-objects/feed-scope.vo";
import { FeedSecretHash } from "../../domain/value-objects/feed-secret-hash.vo";
import type { CalendarFeedSettings } from "../config/calendar-feed-settings";
import {
  type CalendarFeedStatusDto,
  FEED_SECRET_PATTERN,
  feedStatusDto,
  type IssuedCalendarFeedDto,
  type IssueFeedInput,
} from "../dto/calendar-feed.dto";
import type {
  CalendarFeedError,
  ICalendarFeedRepository,
} from "../ports/calendar-feed-repository.port";
import type { IFeedChildren } from "../ports/feed-children.port";
import type { IFeedEntries } from "../ports/feed-entries.port";
import type { IFeedSecrets } from "../ports/feed-secrets.port";
import { writeFeedCalendar } from "./feed-calendar";

export const FEED_HISTORY_DAYS = 30;

interface StoredFeed {
  feed: CalendarFeed;
  rotated: boolean;
}

const scopeInvalid: CalendarFeedError = {
  code: "CALENDAR_FEED_SCOPE_INVALID",
  message: "Choisissez de 1 à 20 enfants, ou aucun pour inclure tous vos enfants.",
};

const childNotFound: CalendarFeedError = {
  code: "CALENDAR_FEED_CHILD_NOT_FOUND",
  message:
    "Un des enfants choisis n'est plus relié à votre compte. Actualisez la page et recommencez.",
};

const secretUnreadable: CalendarFeedError = {
  code: "CALENDAR_FEED_PROVIDER_FAILURE",
  message: "Le lien d'agenda n'a pas pu être créé. Réessayez.",
};

export class CalendarFeedService {
  constructor(
    private readonly feeds: ICalendarFeedRepository,
    private readonly children: IFeedChildren,
    private readonly entries: IFeedEntries,
    private readonly secrets: IFeedSecrets,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly settings: CalendarFeedSettings,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async status(userId: string): Promise<Result<CalendarFeedStatusDto, CalendarFeedError>> {
    return this.span("status", async () =>
      (await this.feeds.findOwned(userId)).map((found) =>
        found.map(feedStatusDto).unwrapOr({ exists: false }),
      ),
    );
  }

  async issue(
    userId: string,
    input: IssueFeedInput,
  ): Promise<Result<IssuedCalendarFeedDto, CalendarFeedError>> {
    return this.span("issue", async () => {
      const scope = FeedScope.fromChildIds(Option.fromNullable(input.childIds));
      if (scope.isFailure) return Result.fail(scopeInvalid);

      const owned = await this.ownsScope(userId, scope.getValue());
      if (owned.isFailure) return Result.fail(owned.getError());

      const issued = this.secrets.issue();
      const secretHash = FeedSecretHash.create(issued.hash);
      if (secretHash.isFailure) return Result.fail(secretUnreadable);

      return this.transactions.run(
        async (): Promise<Result<IssuedCalendarFeedDto, CalendarFeedError>> => {
          const now = this.clock();
          const stored = await this.store(userId, secretHash.getValue(), scope.getValue(), now);
          if (stored.isFailure) return Result.fail(stored.getError());

          const { feed, rotated } = stored.getValue();
          const childIds = feed.get("scope").childIds().toNull();
          await emitEvent(
            this.outbox,
            rotated ? EventTypes.CALENDAR_FEED_ROTATED : EventTypes.CALENDAR_FEED_CREATED,
            "calendar_feed",
            feed.id.value,
            { userId, feedId: feed.id.value, childIds },
          );

          return Result.ok({
            url: new URL(`/calendar/${issued.secret}.ics`, this.settings.feedOrigin).toString(),
            createdAt: feed.get("createdAt").toISOString(),
            childIds,
          });
        },
      );
    });
  }

  async revoke(userId: string): Promise<Result<void, CalendarFeedError>> {
    return this.span("revoke", () =>
      this.transactions.run(async (): Promise<Result<void, CalendarFeedError>> => {
        const deleted = await this.feeds.deleteOwned(userId);
        if (deleted.isFailure) return Result.fail(deleted.getError());
        if (deleted.getValue().isNone()) return Result.ok();

        const feedId = deleted.getValue().unwrap();
        await emitEvent(this.outbox, EventTypes.CALENDAR_FEED_REVOKED, "calendar_feed", feedId, {
          userId,
          feedId,
        });
        return Result.ok();
      }),
    );
  }

  async render(secret: string): Promise<Result<Option<string>, CalendarFeedError>> {
    return this.span("render", async () => {
      if (!FEED_SECRET_PATTERN.test(secret)) return Result.ok(Option.none());

      const secretHash = FeedSecretHash.create(this.secrets.hashOf(secret));
      if (secretHash.isFailure) return Result.ok(Option.none());

      const found = await this.feeds.findBySecretHash(secretHash.getValue());
      if (found.isFailure) return Result.fail(found.getError());
      if (found.getValue().isNone()) return Result.ok(Option.none());

      const feed = found.getValue().unwrap();
      const now = this.clock();
      const listed = await this.entries.list({
        userId: feed.get("userId"),
        childIds: feed.get("scope").childIds(),
        since: shiftInstant(now, -FEED_HISTORY_DAYS),
        now,
      });
      if (listed.isFailure) return Result.fail(this.asFeedError(listed.getError()));

      if (feed.recordFetch(now)) {
        const recorded = await this.feeds.recordFetch(feed);
        if (recorded.isFailure) return Result.fail(recorded.getError());
      }

      return Result.ok(
        Option.some(
          writeFeedCalendar({ entries: listed.getValue(), appHost: this.settings.appHost, now }),
        ),
      );
    });
  }

  private async store(
    userId: string,
    secretHash: FeedSecretHash,
    scope: FeedScope,
    now: Date,
  ): Promise<Result<StoredFeed, CalendarFeedError>> {
    const existing = await this.feeds.lockOwned(userId);
    if (existing.isFailure) return Result.fail(existing.getError());
    if (existing.getValue().isSome()) {
      return this.rotate(existing.getValue().unwrap(), secretHash, scope, now);
    }

    const created = CalendarFeed.create({ userId, secretHash, scope, now });
    const inserted = await this.feeds.insertIfAbsent(created);
    if (inserted.isFailure) return Result.fail(inserted.getError());
    if (inserted.getValue()) return Result.ok({ feed: created, rotated: false });

    const raced = await this.feeds.lockOwned(userId);
    if (raced.isFailure) return Result.fail(raced.getError());
    if (raced.getValue().isNone()) return Result.fail(secretUnreadable);

    return this.rotate(raced.getValue().unwrap(), secretHash, scope, now);
  }

  private async rotate(
    feed: CalendarFeed,
    secretHash: FeedSecretHash,
    scope: FeedScope,
    now: Date,
  ): Promise<Result<StoredFeed, CalendarFeedError>> {
    feed.rotate(secretHash, scope, now);
    const saved = await this.feeds.save(feed);
    if (saved.isFailure) return Result.fail(saved.getError());

    return Result.ok({ feed, rotated: true });
  }

  private async ownsScope(
    userId: string,
    scope: FeedScope,
  ): Promise<Result<void, CalendarFeedError>> {
    const wanted = scope.childIds();
    if (wanted.isNone()) return Result.ok();

    const owned = await this.children.idsOf(userId);
    if (owned.isFailure) return Result.fail(this.asFeedError(owned.getError()));

    const ownedIds = new Set(owned.getValue());
    return wanted.unwrap().every((childId) => ownedIds.has(childId))
      ? Result.ok()
      : Result.fail(childNotFound);
  }

  private asFeedError(error: AppError): CalendarFeedError {
    return { code: "CALENDAR_FEED_PROVIDER_FAILURE", message: error.message, cause: error.cause };
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `CalendarFeedService > ${method}`, op: "function" },
      work,
    );
  }
}
