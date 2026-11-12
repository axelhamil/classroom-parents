import type { IInstrumentation, ILogger, IUnitOfWork } from "@packages/ddd-kit";
import { type ResendBatchClient, resendBatchSender } from "@packages/email/email-delivery-worker";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { defineModule } from "inwire";
import type { AlertsSettings } from "./application/config/alerts-settings";
import { SEND_TIMEOUT_MS } from "./application/config/dispatch-budget";
import type { IAlertContextReader } from "./application/ports/alert-context-reader.port";
import type { IAlertEmailSender } from "./application/ports/alert-email-sender.port";
import type { IAlertRepository } from "./application/ports/alert-repository.port";
import type { IDigestAudience, IDigestDeadlines } from "./application/ports/digest-audience.port";
import type { IEventDeadlines } from "./application/ports/event-deadlines.port";
import type { IPushCopy } from "./application/ports/push-copy.port";
import type { IPushSender } from "./application/ports/push-sender.port";
import type { IPushSubscriptionRepository } from "./application/ports/push-subscription-repository.port";
import type { IReminderSettingsRepository } from "./application/ports/reminder-settings.port";
import type { IWeeklyDigestRepository } from "./application/ports/weekly-digest-repository.port";
import { AlertDispatchService } from "./application/services/alert-dispatch.service";
import { AlertPlanningService } from "./application/services/alert-planning.service";
import { DigestPreferenceService } from "./application/services/digest-preference.service";
import { PushSubscriptionService } from "./application/services/push-subscription.service";
import { ReminderSettingsService } from "./application/services/reminder-settings.service";
import { WeeklyDigestService } from "./application/services/weekly-digest.service";
import { I18nPushCopy } from "./infrastructure/adapters/i18n-push.copy";
import { ResendAlertEmailSender } from "./infrastructure/adapters/resend-alert-email.sender";
import { WebPushSender } from "./infrastructure/adapters/web-push.sender";
import { DrizzleAlertRepository } from "./infrastructure/repositories/drizzle-alert.repository";
import { DrizzlePushSubscriptionRepository } from "./infrastructure/repositories/drizzle-push-subscription.repository";
import { DrizzleReminderSettingsRepository } from "./infrastructure/repositories/drizzle-reminder-settings.repository";
import { DrizzleWeeklyDigestRepository } from "./infrastructure/repositories/drizzle-weekly-digest.repository";

export interface AlertsPrerequisites {
  IInstrumentation: IInstrumentation;
  ILogger: ILogger;
  IResendClient: ResendBatchClient | null;
  ITransactionService: IUnitOfWork;
  IOutboxRepository: IOutboxRepository;
  IEventDeadlines: IEventDeadlines;
  IAlertContextReader: IAlertContextReader;
  IDigestAudience: IDigestAudience;
  IDigestDeadlines: IDigestDeadlines;
  alertsSettings: AlertsSettings;
}

export const alertsModule = defineModule<AlertsPrerequisites>()((b) =>
  b
    .add(
      "IAlertRepository",
      (c): IAlertRepository => new DrizzleAlertRepository(c.IInstrumentation),
    )
    .add(
      "IReminderSettingsRepository",
      (c): IReminderSettingsRepository => new DrizzleReminderSettingsRepository(c.IInstrumentation),
    )
    .add(
      "IPushSubscriptionRepository",
      (c): IPushSubscriptionRepository => new DrizzlePushSubscriptionRepository(c.IInstrumentation),
    )
    .add(
      "IWeeklyDigestRepository",
      (c): IWeeklyDigestRepository => new DrizzleWeeklyDigestRepository(c.IInstrumentation),
    )
    .add("IPushCopy", (): IPushCopy => new I18nPushCopy())
    .add("IPushSender", (c): IPushSender => new WebPushSender(c.IInstrumentation, c.alertsSettings))
    .add(
      "IAlertEmailSender",
      (c): IAlertEmailSender =>
        new ResendAlertEmailSender(
          resendBatchSender(c.IResendClient, c.IInstrumentation, c.ILogger, SEND_TIMEOUT_MS),
          c.alertsSettings.emailFrom,
          c.IInstrumentation,
          c.ILogger,
        ),
    )
    .add(
      "AlertPlanningService",
      (c) =>
        new AlertPlanningService(
          c.IAlertRepository,
          c.IReminderSettingsRepository,
          c.IEventDeadlines,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "ReminderSettingsService",
      (c) =>
        new ReminderSettingsService(
          c.IReminderSettingsRepository,
          c.IAlertRepository,
          c.IEventDeadlines,
          c.AlertPlanningService,
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
          c.IPushCopy,
          c.IEventDeadlines,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
        ),
    )
    .add(
      "WeeklyDigestService",
      (c) =>
        new WeeklyDigestService(
          c.IWeeklyDigestRepository,
          c.IDigestAudience,
          c.IDigestDeadlines,
          c.IPushSubscriptionRepository,
          c.IPushSender,
          c.IAlertEmailSender,
          c.IPushCopy,
          c.ITransactionService,
          c.IOutboxRepository,
          c.IInstrumentation,
          c.alertsSettings.appOrigin,
        ),
    )
    .add(
      "DigestPreferenceService",
      (c) =>
        new DigestPreferenceService(
          c.IWeeklyDigestRepository,
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
