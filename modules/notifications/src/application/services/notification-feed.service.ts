import {
  type AppError,
  type IInstrumentation,
  type IUnitOfWork,
  Option,
  Result,
} from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { eventIdsOf } from "../../domain/notification-content";
import type { EventSummary, IEventSummaries } from "../ports/event-summaries.port";
import {
  type FeedCursor,
  type INotificationRepository,
  type NotificationsError,
  notificationNotFound,
  type StoredNotification,
} from "../ports/notification-repository.port";

type Outcome<T> = Promise<Result<T, NotificationsError | AppError>>;

export interface FeedNotification extends StoredNotification {
  event: Option<EventSummary & { id: string }>;
}

export interface Feed {
  notifications: FeedNotification[];
  nextCursor: Option<string>;
}

export class NotificationFeedService {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly events: IEventSummaries,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(userId: string, cursor: Option<FeedCursor>, limit: number): Outcome<Feed> {
    return this.span("list", async () => {
      const page = await this.notifications.page(userId, cursor, limit);
      if (page.isFailure) return Result.fail(page.getError());

      const { notifications, nextCursor } = page.getValue();
      const firstEvents = notifications.flatMap(({ content }) => eventIdsOf(content).slice(0, 1));
      const summaries = await this.events.summariesOf(userId, [...new Set(firstEvents)]);
      if (summaries.isFailure) return Result.fail(summaries.getError());

      const withEvents = notifications.map((stored) =>
        this.withEvent(stored, summaries.getValue()),
      );
      return Result.ok({ notifications: withEvents, nextCursor });
    });
  }

  unreadCount(userId: string): Outcome<number> {
    return this.span("unreadCount", () => this.notifications.unreadCount(userId));
  }

  markRead(userId: string, notificationId: string): Outcome<void> {
    return this.span("markRead", () =>
      this.transactions.run(async (): Outcome<void> => {
        const marked = await this.notifications.markRead(userId, notificationId, this.clock());
        if (marked.isFailure) return Result.fail(marked.getError());
        if (marked.getValue() === "absent") return Result.fail(notificationNotFound);

        if (marked.getValue() === "read") await this.announceRead(userId, notificationId);
        return Result.ok();
      }),
    );
  }

  markReadByRef(userId: string, ref: string): Outcome<void> {
    return this.span("markReadByRef", () =>
      this.transactions.run(async (): Outcome<void> => {
        const marked = await this.notifications.markReadByRef(userId, ref, this.clock());
        if (marked.isFailure) return Result.fail(marked.getError());

        const read = marked.getValue();
        if (read.isSome()) await this.announceRead(userId, read.unwrap());
        return Result.ok();
      }),
    );
  }

  markAllRead(userId: string): Outcome<number> {
    return this.span("markAllRead", () =>
      this.transactions.run(async (): Outcome<number> => {
        const marked = await this.notifications.markAllRead(userId, this.clock());
        if (marked.isFailure) return Result.fail(marked.getError());

        const count = marked.getValue();
        if (count > 0)
          await emitEvent(this.outbox, EventTypes.NOTIFICATIONS_READ_ALL, "user", userId, {
            userId,
            count,
          });
        return Result.ok(count);
      }),
    );
  }

  private withEvent(
    stored: StoredNotification,
    summaries: Map<string, EventSummary>,
  ): FeedNotification {
    const [eventId] = eventIdsOf(stored.content);
    const event = Option.fromNullable(eventId).flatMap((id) =>
      Option.fromNullable(summaries.get(id)).map((summary) => ({ id, ...summary })),
    );

    return { ...stored, event };
  }

  private async announceRead(userId: string, notificationId: string): Promise<void> {
    await emitEvent(this.outbox, EventTypes.NOTIFICATION_READ, "notification", notificationId, {
      userId,
      notificationId,
    });
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `NotificationFeedService > ${method}`, op: "function" },
      work,
    );
  }
}
