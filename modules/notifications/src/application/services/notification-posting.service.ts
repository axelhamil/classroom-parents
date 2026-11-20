import { type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type {
  INotificationRepository,
  NotificationDraft,
  NotificationsError,
  PostedNotification,
} from "../ports/notification-repository.port";

export class NotificationPostingService {
  constructor(
    private readonly notifications: INotificationRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  post(draft: NotificationDraft): Promise<Result<void, NotificationsError>> {
    return this.instrumentation.startSpan(
      { name: "NotificationPostingService > post", op: "function" },
      () =>
        this.transactions.run(async (): Promise<Result<void, NotificationsError>> => {
          const posted = await this.notifications.post(draft);
          if (posted.isFailure) return Result.fail(posted.getError());

          const written = posted.getValue();
          if (written.isSome()) await this.announce(draft, written.unwrap());
          return Result.ok();
        }),
    );
  }

  private async announce(draft: NotificationDraft, posted: PostedNotification): Promise<void> {
    await emitEvent(
      this.outbox,
      EventTypes.NOTIFICATION_CREATED,
      "notification",
      posted.notificationId,
      {
        userId: draft.userId,
        notificationId: posted.notificationId,
        kind: draft.content.kind,
        grouped: posted.grouped,
        actorUserId: null,
      },
    );
  }
}
