import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IEmailService } from "@packages/email/email.port";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { AlertsSettings } from "./application/config/alerts-settings";
import type { IAlertContextReader } from "./application/ports/alert-context-reader.port";
import type { IAlertEmailSender } from "./application/ports/alert-email-sender.port";
import type { IAlertRepository } from "./application/ports/alert-repository.port";
import type { IEventDeadlines } from "./application/ports/event-deadlines.port";
import type { IPushSender } from "./application/ports/push-sender.port";
import type { IPushSubscriptionRepository } from "./application/ports/push-subscription-repository.port";
import { AlertDispatchService } from "./application/services/alert-dispatch.service";
import { AlertPlanningService } from "./application/services/alert-planning.service";
import { PushSubscriptionService } from "./application/services/push-subscription.service";
import { ResendAlertEmailSender } from "./infrastructure/adapters/resend-alert-email.sender";
import { WebPushSender } from "./infrastructure/adapters/web-push.sender";
import { DrizzleAlertRepository } from "./infrastructure/repositories/drizzle-alert.repository";
import { DrizzlePushSubscriptionRepository } from "./infrastructure/repositories/drizzle-push-subscription.repository";

export interface AlertsPrerequisites {
  IInstrumentation: IInstrumentation;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEmailService: IEmailService;
  IEventDeadlines: IEventDeadlines;
  IAlertContextReader: IAlertContextReader;
  alertsSettings: AlertsSettings;
}

export const alertsModule = defineModule<AlertsPrerequisites>()((b) =>
  b
    .add(
      "IAlertRepository",
      (c): IAlertRepository => new DrizzleAlertRepository(c.IInstrumentation),
    )
    .add(
      "IPushSubscriptionRepository",
      (c): IPushSubscriptionRepository => new DrizzlePushSubscriptionRepository(c.IInstrumentation),
    )
    .add("IPushSender", (c): IPushSender => new WebPushSender(c.IInstrumentation, c.alertsSettings))
    .add(
      "IAlertEmailSender",
      (c): IAlertEmailSender => new ResendAlertEmailSender(c.IEmailService, c.IInstrumentation),
    )
    .add(
      "AlertPlanningService",
      (c) =>
        new AlertPlanningService(
          c.IAlertRepository,
          c.IEventDeadlines,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "AlertDispatchService",
      (c) =>
        new AlertDispatchService(
          c.IAlertRepository,
          c.IPushSubscriptionRepository,
          c.IPushSender,
          c.IAlertEmailSender,
          c.IAlertContextReader,
          c.IEventDeadlines,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "PushSubscriptionService",
      (c) =>
        new PushSubscriptionService(
          c.IPushSubscriptionRepository,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    ),
);
