import { agendaModule } from "@modules/agenda/agenda.module";
import { childrenModule } from "@modules/children/children.module";
import { classroomSyncModule } from "@modules/classroom-sync/classroom-sync.module";
import { extractionModule } from "@modules/extraction/extraction.module";
import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { getRateLimitDbClient, TransactionService } from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { IEmailService } from "@packages/email/email.port";
import { QueuedEmailService } from "@packages/email/email.service";
import {
  EmailDeliveryWorker,
  type ResendBatchClient,
  resendBatchSender,
} from "@packages/email/email-delivery-worker";
import type { IEmailQueue } from "@packages/email/email-queue.port";
import { ALL_EVENT_TYPES } from "@packages/events";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import { buildEventDispatcher } from "@packages/outbox/event-handlers";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_STOP_SETTLE_MARGIN_MS,
  OutboxDispatcher,
} from "@packages/outbox/outbox-dispatcher";
import { OutboxRelay } from "@packages/outbox/outbox-relay";
import { container } from "inwire";
import { Resend } from "resend";
import { alertsNotComposedYet } from "./composition/alert-planner";
import {
  announcementExtractorFor,
  childAccessTokensFor,
  childConnectionsFor,
  childOwnershipFor,
  childSyncStateFor,
  dueChildrenFor,
  eventIngestFor,
  manualSyncGateFor,
} from "./composition/bindings";
import { fakeProviderBindings } from "./composition/fake-bindings";
import { apiSettings } from "./composition/settings";
import { healthModule } from "./modules/health/module";
import { rgpdModule } from "./modules/rgpd/module";
import { authSecretKey } from "./shared/auth/auth-secrets";
import { googleTokenSealing } from "./shared/auth/token-sealing";
import type { OutermostUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { ICaptchaService } from "./shared/ports/captcha.port";
import type { IRateLimiter, IRateLimitUsage } from "./shared/ports/rate-limiter.port";
import { getRequestId } from "./shared/request-context";
import { LoggingInstrumentation } from "./shared/services/logging-instrumentation";
import { NoopCaptchaService } from "./shared/services/noop-captcha.service";
import { NotificationStreamHub } from "./shared/services/notification-stream-hub";
import {
  RateLimiterFlexibleAdapter,
  storeFactoryFor,
} from "./shared/services/rate-limiter-flexible.adapter";
import { SentryInstrumentation } from "./shared/services/sentry-instrumentation";
import { SiteverifyCaptchaService } from "./shared/services/siteverify-captcha.service";
import { PgUserStreamPublisher, userStreamRelay } from "./shared/services/user-stream-relay";

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork & OutermostUnitOfWork;
    IEmailQueue: IEmailQueue;
    IEmailService: IEmailService;
    IResendClient: ResendBatchClient | null;
    IOutboxRepository: IOutboxRepository;
    IInstrumentation: IInstrumentation;
    IRateLimiter: IRateLimiter & IRateLimitUsage;
    ICaptchaService: ICaptchaService;
    NotificationStreamHub: NotificationStreamHub;
    OutboxDispatcher: OutboxDispatcher;
    EmailDeliveryWorker: EmailDeliveryWorker;
  }
}

export const di = container()
  .addModule(apiSettings(env))
  .add("ILogger", () => logger)
  .add("googleTokenSealing", () => googleTokenSealing(authSecretKey(env)))
  .add(
    "IInstrumentation",
    (): IInstrumentation =>
      env.SENTRY_DSN ? new SentryInstrumentation() : new LoggingInstrumentation(logger),
  )
  .add("IResendClient", (): ResendBatchClient | null =>
    env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null,
  )
  .add(
    "IOutboxRepository",
    (c): IOutboxRepository => new DrizzleOutboxRepository(c.IInstrumentation, getRequestId),
  )
  .add(
    "ITransactionService",
    (c) =>
      new TransactionService(c.IInstrumentation, async (events) => {
        await c.IOutboxRepository.enqueue(events, { source: "app/api" });
      }),
  )
  .add("IEmailQueue", (c): IEmailQueue => new DrizzleEmailQueue(c.IInstrumentation, logger))
  .add(
    "IEmailService",
    (c): IEmailService => new QueuedEmailService(c.IEmailQueue, c.IInstrumentation),
  )
  .add(
    "EmailDeliveryWorker",
    (c) =>
      new EmailDeliveryWorker(
        c.IEmailQueue,
        c.IOutboxRepository,
        c.ITransactionService,
        logger,
        c.IInstrumentation,
        {
          leaseSeconds: env.EMAIL_LEASE_SECONDS,
          deadRetrySeconds: env.EMAIL_DEAD_RETRY_HOURS * 3600,
          deadReplayWindowHours: env.EMAIL_DEAD_REPLAY_WINDOW_HOURS,
          from: env.RESEND_FROM,
        },
        resendBatchSender(c.IResendClient, c.IInstrumentation, logger),
      ),
  )
  .add(
    "IRateLimiter",
    (c): IRateLimiter & IRateLimitUsage =>
      new RateLimiterFlexibleAdapter(
        c.IInstrumentation,
        storeFactoryFor(env.RATE_LIMIT_STORE, getRateLimitDbClient),
      ),
  )
  .add(
    "ICaptchaService",
    (c): ICaptchaService =>
      env.CAPTCHA_SECRET_KEY
        ? new SiteverifyCaptchaService(c.IInstrumentation, {
            secretKey: env.CAPTCHA_SECRET_KEY,
            verifyUrl: env.CAPTCHA_VERIFY_URL,
            timeoutMs: env.CAPTCHA_TIMEOUT_MS,
          })
        : new NoopCaptchaService(),
  )
  .add(
    "NotificationStreamHub",
    (c) => new NotificationStreamHub(logger, env.DATABASE_URL, c.IInstrumentation),
  )
  .addModule(healthModule)
  .addModule(childrenModule)
  .add("IChildOwnership", (c) => childOwnershipFor(c.ChildConnectionService))
  .add("IAlertPlanner", () => alertsNotComposedYet)
  .addModule(agendaModule)
  .addModule(extractionModule)
  .add("IChildAccessTokens", (c) => childAccessTokensFor(c.ChildConnectionService))
  .add("IAnnouncementExtractor", (c) => announcementExtractorFor(c.ExtractionService))
  .add("IEventIngest", (c) => eventIngestFor(c.EventIngestService))
  .add("IDueChildren", (c) => dueChildrenFor(c.ChildConnectionService))
  .add("IChildSyncState", (c) => childSyncStateFor(c.ChildConnectionService))
  .add("IManualSyncGate", (c) => manualSyncGateFor(c.ChildConnectionService))
  .addModule(classroomSyncModule)
  .add("IChildConnections", (c) => childConnectionsFor(c.ChildConnectionService))
  .addModule(rgpdModule)
  .addModule(fakeProviderBindings(env))
  .add(
    "OutboxDispatcher",
    (c) =>
      new OutboxDispatcher(
        c.IOutboxRepository,
        (diLike) =>
          new OutboxRelay(
            c.IOutboxRepository,
            c.ITransactionService,
            buildEventDispatcher(
              [userStreamRelay(new PgUserStreamPublisher(c.IInstrumentation))],
              diLike,
            ),
            {
              eventTypes: ALL_EVENT_TYPES,
              batchSize: OUTBOX_BATCH_SIZE,
              maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
              leaseSeconds: env.OUTBOX_LEASE_SECONDS,
              deadRetrySeconds: env.OUTBOX_DEAD_RETRY_HOURS * 3600,
              concurrency: env.OUTBOX_CONCURRENCY,
              handlerBudgetSeconds: env.OUTBOX_HANDLER_BUDGET_SECONDS,
            },
            c.IInstrumentation,
            logger,
          ),
        logger,
        env.DATABASE_URL,
        c.IInstrumentation,
        {
          stopGraceMs: Math.max(0, env.SHUTDOWN_WORKERS_TIMEOUT_MS - OUTBOX_STOP_SETTLE_MARGIN_MS),
        },
      ),
  )
  .build();
