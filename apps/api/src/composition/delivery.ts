import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { WeeklyDigestService } from "@modules/alerts/application/services/weekly-digest.service";
import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";
import type { SyncDueChildrenService } from "@modules/classroom-sync/application/services/sync-due-children.service";
import type { IBackgroundWork, IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { EmailDeliveryWorker } from "@packages/email/email-delivery-worker";
import { ALL_EVENT_TYPES } from "@packages/events";
import { buildEventDispatcher } from "@packages/outbox/event-handlers";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  type CreateOutboxRelay,
  OUTBOX_BATCH_SIZE,
  OutboxDispatcher,
} from "@packages/outbox/outbox-dispatcher";
import { OutboxRelay, type OutboxRelayOptions } from "@packages/outbox/outbox-relay";
import { defineModule } from "inwire";
import type { RgpdService } from "../modules/rgpd/application/services/rgpd.service";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";
import { BackgroundWork } from "../shared/services/background-work";
import { NotificationStreamHub } from "../shared/services/notification-stream-hub";
import { PgUserStreamPublisher, userStreamRelay } from "../shared/services/user-stream-relay";
import { ClockService } from "../workers/clock";
import { DeliveryDrain } from "../workers/delivery";
import type { RgpdWorkerSettings } from "../workers/rgpd-worker";

export interface DeliveryPrerequisites {
  ILogger: Logger;
  IInstrumentation: IInstrumentation;
  IOutboxRepository: IOutboxRepository;
  ITransactionService: IUnitOfWork;
  EmailDeliveryWorker: EmailDeliveryWorker;
  ISweepRunStore: ISweepRunStore;
  SyncDueChildrenService: SyncDueChildrenService;
  ChildConnectionService: ChildConnectionService;
  AlertDispatchService: AlertDispatchService;
  WeeklyDigestService: WeeklyDigestService;
  RgpdService: RgpdService;
}

export const runtimeModule = (listenerDatabaseUrl: string) =>
  defineModule<{ ILogger: Logger; IInstrumentation: IInstrumentation }>()((b) =>
    b
      .add(
        "NotificationStreamHub",
        (c) => new NotificationStreamHub(c.ILogger, listenerDatabaseUrl, c.IInstrumentation),
      )
      .add("BackgroundWork", (c) => new BackgroundWork(c.IInstrumentation))
      .add("IBackgroundWork", (c): IBackgroundWork => c.BackgroundWork),
  );

export interface DeliverySettings {
  relay: Omit<OutboxRelayOptions, "eventTypes" | "batchSize">;
  listenerDatabaseUrl: string;
  dispatcherStopGraceMs: number;
  tickBudgetMs: number;
  sweep: RgpdWorkerSettings;
}

export type EventHandlerSource = () => Record<string, unknown>;

export const deliveryModule = (settings: DeliverySettings, handlers: EventHandlerSource) =>
  defineModule<DeliveryPrerequisites>()((b) =>
    b
      .add(
        "createOutboxRelay",
        (c): CreateOutboxRelay =>
          (diLike) =>
            new OutboxRelay(
              c.IOutboxRepository,
              c.ITransactionService,
              buildEventDispatcher(
                [userStreamRelay(new PgUserStreamPublisher(c.IInstrumentation))],
                diLike,
              ),
              { ...settings.relay, eventTypes: ALL_EVENT_TYPES, batchSize: OUTBOX_BATCH_SIZE },
              c.IInstrumentation,
              c.ILogger,
            ),
      )
      .add(
        "OutboxDispatcher",
        (c) =>
          new OutboxDispatcher(
            c.IOutboxRepository,
            c.createOutboxRelay,
            c.ILogger,
            settings.listenerDatabaseUrl,
            c.IInstrumentation,
            { stopGraceMs: settings.dispatcherStopGraceMs },
          ),
      )
      .add("DeliveryDrain", (c) => {
        const createRelay = c.createOutboxRelay;
        let relay: OutboxRelay | undefined;

        return new DeliveryDrain({
          relay: () => {
            const built = relay ?? createRelay(handlers());
            relay = built;
            return built;
          },
          emails: c.EmailDeliveryWorker,
          instrumentation: c.IInstrumentation,
          logger: c.ILogger,
          budgetMs: settings.tickBudgetMs,
        });
      })
      .add(
        "ClockService",
        (c) =>
          new ClockService(
            {
              SyncDueChildrenService: c.SyncDueChildrenService,
              ChildConnectionService: c.ChildConnectionService,
              AlertDispatchService: c.AlertDispatchService,
              WeeklyDigestService: c.WeeklyDigestService,
              RgpdService: c.RgpdService,
              ITransactionService: c.ITransactionService,
              IInstrumentation: c.IInstrumentation,
              ISweepRunStore: c.ISweepRunStore,
              IOutboxRepository: c.IOutboxRepository,
              DeliveryDrain: c.DeliveryDrain,
            },
            { tickBudgetMs: settings.tickBudgetMs, sweep: settings.sweep },
            c.ILogger,
          ),
      ),
  );
