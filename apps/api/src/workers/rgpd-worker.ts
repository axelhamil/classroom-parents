import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { RgpdService } from "../modules/rgpd/application/services/rgpd.service";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";
import { startPeriodic } from "./periodic";
import { sweepDeliveredOutbox, sweepOldEmails } from "./retention";

export const RGPD_TICK_MS = 60 * 60_000;

export interface RgpdWorkerDeps {
  RgpdService: Pick<RgpdService, "processPendingDeletions">;
  ITransactionService: IUnitOfWork;
  IInstrumentation: IInstrumentation;
  ISweepRunStore: ISweepRunStore;
}

export interface RgpdWorkerSettings {
  emailRetentionDays: number;
  emailDeadReplayWindowHours: number;
  sweepBatchSize: number;
  sweepDeadlineMs: number;
}

export function startRgpdWorkers(
  deps: RgpdWorkerDeps,
  settings: RgpdWorkerSettings,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  const options = {
    onError: (err: unknown) => deps.IInstrumentation.capture(err),
    runAtStart: true,
  };

  const wipeDueAccounts = async () => {
    const swept = await deps.RgpdService.processPendingDeletions({
      now: new Date(),
      batchSize: settings.sweepBatchSize,
      deadlineMs: settings.sweepDeadlineMs,
    });
    if (swept.isFailure) logger.warn({ code: swept.getError().code }, "rgpd sweep failed");
  };

  const retention = {
    uow: deps.ITransactionService,
    instrumentation: deps.IInstrumentation,
    sweepRuns: deps.ISweepRunStore,
    logger,
    deadlineMs: settings.sweepDeadlineMs,
  };
  const purgeOldEmails = () =>
    sweepOldEmails({
      ...retention,
      retentionDays: settings.emailRetentionDays,
      deadReplayWindowHours: settings.emailDeadReplayWindowHours,
    });
  const purgeDeliveredEvents = () => sweepDeliveredOutbox(retention);

  return Promise.all([
    startPeriodic(wipeDueAccounts, RGPD_TICK_MS, signal, options),
    startPeriodic(purgeOldEmails, RGPD_TICK_MS, signal, options),
    startPeriodic(purgeDeliveredEvents, RGPD_TICK_MS, signal, options),
  ]).then(() => undefined);
}
