import { agendaModule } from "@modules/agenda/agenda.module";
import type { IAlertPlanner } from "@modules/agenda/application/ports/alert-planner.port";
import { alertsModule } from "@modules/alerts/alerts.module";
import type { IAlertContextReader } from "@modules/alerts/application/ports/alert-context-reader.port";
import type { IDigestAudience } from "@modules/alerts/application/ports/digest-audience.port";
import type { AlertPlanningService } from "@modules/alerts/application/services/alert-planning.service";
import { calendarFeedModule } from "@modules/calendar-feed/calendar-feed.module";
import { childrenModule } from "@modules/children/children.module";
import { classroomSyncModule } from "@modules/classroom-sync/classroom-sync.module";
import { extractionModule } from "@modules/extraction/extraction.module";
import type { IBackgroundWork, IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import {
  configureDbPool,
  configureRateLimitDbPool,
  getRateLimitDbClient,
  TransactionService,
} from "@packages/drizzle";
import { DrizzleEmailQueue } from "@packages/email/drizzle-email-queue";
import type { IEmailService } from "@packages/email/email.port";
import { QueuedEmailService } from "@packages/email/email.service";
import {
  EmailDeliveryWorker,
  type ResendBatchClient,
  resendBatchSender,
} from "@packages/email/email-delivery-worker";
import type { IEmailQueue } from "@packages/email/email-queue.port";
import { DrizzleOutboxRepository } from "@packages/outbox/drizzle-outbox.repository";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  type CreateOutboxRelay,
  OUTBOX_STOP_SETTLE_MARGIN_MS,
  type OutboxDispatcher,
} from "@packages/outbox/outbox-dispatcher";
import { container } from "inwire";
import { Resend } from "resend";
import {
  alertPlannerFor,
  announcementExtractorFor,
  childAccessTokensFor,
  childConnectionsFor,
  childOwnershipFor,
  childSyncStateFor,
  digestDeadlinesFor,
  dueChildrenFor,
  eventDeadlinesFor,
  eventIngestFor,
  feedEntriesFor,
  manualSyncGateFor,
  visibleChildrenFor,
} from "./composition/bindings";
import { deliveryModule, runtimeModule } from "./composition/delivery";
import { fakeProviderBindings } from "./composition/fake-bindings";
import { apiSettings } from "./composition/settings";
import { healthModule } from "./modules/health/module";
import type { IUserDataReader } from "./modules/rgpd/application/ports/user-data-reader.port";
import { rgpdModule } from "./modules/rgpd/module";
import { AlertContextQuery } from "./queries/alert-context.query";
import { DigestAudienceQuery } from "./queries/digest-audience.query";
import { FeedAlarmsQuery } from "./queries/feed-alarms.query";
import { UpcomingAlertsQuery } from "./queries/upcoming-alerts.query";
import { UserDataQuery } from "./queries/user-data.query";
import { authSecretKey } from "./shared/auth/auth-secrets";
import { googleTokenSealing } from "./shared/auth/token-sealing";
import type { OutermostUnitOfWork } from "./shared/auth/unit-of-work-adapter";
import { env } from "./shared/env";
import { logger } from "./shared/logger";
import type { ICaptchaService } from "./shared/ports/captcha.port";
import type { IRateLimiter, IRateLimitUsage } from "./shared/ports/rate-limiter.port";
import type { ISweepRunStore } from "./shared/ports/sweep-run.port";
import { getRequestId } from "./shared/request-context";
import type { BackgroundWork } from "./shared/services/background-work";
import { DrizzleSweepRunStore } from "./shared/services/drizzle-sweep-run.store";
import { LoggingInstrumentation } from "./shared/services/logging-instrumentation";
import { NoopCaptchaService } from "./shared/services/noop-captcha.service";
import type { NotificationStreamHub } from "./shared/services/notification-stream-hub";
import {
  RateLimiterFlexibleAdapter,
  storeFactoryFor,
} from "./shared/services/rate-limiter-flexible.adapter";
import { SentryInstrumentation } from "./shared/services/sentry-instrumentation";
import { SiteverifyCaptchaService } from "./shared/services/siteverify-captcha.service";
import type { ClockService } from "./workers/clock";
import type { DeliveryDrain } from "./workers/delivery";

type AlertPlanner = Pick<AlertPlanningService, "planDefault" | "replan" | "cancel">;

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
    BackgroundWork: BackgroundWork;
    IBackgroundWork: IBackgroundWork;
    createOutboxRelay: CreateOutboxRelay;
    DeliveryDrain: DeliveryDrain;
    ClockService: ClockService;
  }
}

configureDbPool(env.DATABASE_POOL_MAX);
configureRateLimitDbPool(env.RATE_LIMIT_POOL_MAX);

const listenerDatabaseUrl = env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;

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
  .add("ISweepRunStore", (c): ISweepRunStore => new DrizzleSweepRunStore(c.IInstrumentation))
  .addModule(runtimeModule(listenerDatabaseUrl))
  .addModule(healthModule)
  .addModule(childrenModule)
  .add("IChildOwnership", (c) => childOwnershipFor(c.ChildSyncService))
  .add("IVisibleChildren", (c) => visibleChildrenFor(c.ChildConnectionService))
  .add(
    "IAlertPlanner",
    (): IAlertPlanner => alertPlannerFor((): AlertPlanner => di.AlertPlanningService),
  )
  .addModule(agendaModule)
  .add("IEventDeadlines", (c) => eventDeadlinesFor(c.EventQueryService, c.ChildConnectionService))
  .add(
    "IAlertContextReader",
    (c): IAlertContextReader => new AlertContextQuery(c.IInstrumentation, env.APP_ORIGIN),
  )
  .add("IDigestAudience", (c): IDigestAudience => new DigestAudienceQuery(c.IInstrumentation))
  .add("IDigestDeadlines", (c) => digestDeadlinesFor(c.EventQueryService, c.ChildConnectionService))
  .addModule(alertsModule)
  .add("IFeedChildren", (c) => visibleChildrenFor(c.ChildConnectionService))
  .add("IFeedEntries", (c) =>
    feedEntriesFor(
      c.EventQueryService,
      c.ChildConnectionService,
      new FeedAlarmsQuery(c.IInstrumentation),
    ),
  )
  .addModule(calendarFeedModule)
  .addModule(extractionModule)
  .add("IChildAccessTokens", (c) => childAccessTokensFor(c.GoogleAccessService))
  .add("IAnnouncementExtractor", (c) => announcementExtractorFor(c.ExtractionService))
  .add("IEventIngest", (c) => eventIngestFor(c.EventIngestService))
  .add("IDueChildren", (c) => dueChildrenFor(c.ChildSyncService))
  .add("IChildSyncState", (c) => childSyncStateFor(c.ChildSyncService))
  .add("IManualSyncGate", (c) => manualSyncGateFor(c.ChildConnectionService, c.ChildSyncService))
  .add("IUpcomingAlerts", (c) => new UpcomingAlertsQuery(c.IInstrumentation))
  .addModule(classroomSyncModule)
  .add("IChildConnections", (c) => childConnectionsFor(c.ChildConnectionService))
  .add("IUserDataReader", (c): IUserDataReader => new UserDataQuery(c.IInstrumentation))
  .addModule(rgpdModule)
  .addModule(await fakeProviderBindings(env))
  .addModule(
    deliveryModule(
      {
        relay: {
          maxAttempts: env.OUTBOX_MAX_ATTEMPTS,
          leaseSeconds: env.OUTBOX_LEASE_SECONDS,
          deadRetrySeconds: env.OUTBOX_DEAD_RETRY_HOURS * 3600,
          concurrency: env.OUTBOX_CONCURRENCY,
          handlerBudgetSeconds: env.OUTBOX_HANDLER_BUDGET_SECONDS,
        },
        listenerDatabaseUrl,
        dispatcherStopGraceMs: Math.max(
          0,
          env.SHUTDOWN_WORKERS_TIMEOUT_MS - OUTBOX_STOP_SETTLE_MARGIN_MS,
        ),
        tickBudgetMs: env.CLOCK_TICK_BUDGET_MS,
        sweep: {
          emailRetentionDays: env.EMAIL_RETENTION_DAYS,
          emailDeadReplayWindowHours: env.EMAIL_DEAD_REPLAY_WINDOW_HOURS,
          sweepBatchSize: env.RGPD_SWEEP_BATCH_SIZE,
          sweepDeadlineMs: env.SWEEP_DEADLINE_MS,
        },
      },
      (): Record<string, unknown> => di,
    ),
  )
  .build();
