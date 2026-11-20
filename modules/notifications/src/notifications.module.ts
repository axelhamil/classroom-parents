import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import {
  notifyOnAccessLossSent,
  notifyOnDateToCheck,
  notifyOnDeadlineAmended,
  notifyOnNewDeadlines,
  notifyOnReminderSent,
  notifyOnSchoolAllowed,
  notifyOnWeeklyDigestSent,
} from "./application/event-handlers/notify-on-events";
import type { IEventSummaries } from "./application/ports/event-summaries.port";
import type { INotificationRepository } from "./application/ports/notification-repository.port";
import { NotificationFeedService } from "./application/services/notification-feed.service";
import { NotificationPostingService } from "./application/services/notification-posting.service";
import { DrizzleNotificationRepository } from "./infrastructure/repositories/drizzle-notification.repository";

export interface NotificationsPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEventSummaries: IEventSummaries;
}

export const notificationsModule = defineModule<NotificationsPrerequisites>()((b) =>
  b
    .add(
      "INotificationRepository",
      (c): INotificationRepository => new DrizzleNotificationRepository(c.IInstrumentation),
    )
    .add(
      "NotificationPostingService",
      (c) =>
        new NotificationPostingService(
          c.INotificationRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "NotificationFeedService",
      (c) =>
        new NotificationFeedService(
          c.INotificationRepository,
          c.IEventSummaries,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add("notifyOnReminderSent", (c) => notifyOnReminderSent(c))
    .add("notifyOnWeeklyDigestSent", (c) => notifyOnWeeklyDigestSent(c))
    .add("notifyOnAccessLossSent", (c) => notifyOnAccessLossSent(c))
    .add("notifyOnNewDeadlines", (c) => notifyOnNewDeadlines(c))
    .add("notifyOnSchoolAllowed", (c) => notifyOnSchoolAllowed(c))
    .add("notifyOnDeadlineAmended", (c) => notifyOnDeadlineAmended(c))
    .add("notifyOnDateToCheck", (c) => notifyOnDateToCheck(c)),
);
