import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import { getRateLimitDbClient, TransactionService } from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { IEmailService } from "@packages/email/email.port";
import { QueuedEmailService } from "@packages/email/email.service";
import { EmailDeliveryWorker, resendBatchSender } from "@packages/email/email-delivery-worker";
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
import { apiSettings } from "./composition/settings";
import { healthModule } from "./modules/health/module";
import { rgpdModule } from "./modules/rgpd/module";
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

declare module "inwire" {
  interface AppDeps {
    ITransactionService: IUnitOfWork & OutermostUnitOfWork;
    IEmailQueue: IEmailQueue;
    IEmailService: IEmailService;
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
  .add(
    "IInstrumentation",
    (): IInstrumentation =>
      env.SENTRY_DSN ? new SentryInstrumentation() : new LoggingInstrumentation(logger),
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
        resendBatchSender(
          env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null,
          c.IInstrumentation,
          logger,
        ),
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
  .addModule(rgpdModule)
  .add(
    "OutboxDispatcher",
    (c) =>
      new OutboxDispatcher(
        c.IOutboxRepository,
        (diLike) =>
          new OutboxRelay(
            c.IOutboxRepository,
            c.ITransactionService,
            buildEventDispatcher([], diLike),
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
