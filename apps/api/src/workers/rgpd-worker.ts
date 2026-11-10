import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { RgpdService } from "../modules/rgpd/application/services/rgpd.service";
import type { Logger } from "../shared/logger";
import { startPeriodic } from "./periodic";
import { sweepSentEmails } from "./retention";

export const RGPD_TICK_MS = 60 * 60_000;

export interface RgpdWorkerDeps {
  RgpdService: Pick<RgpdService, "processPendingDeletions">;
  ITransactionService: IUnitOfWork;
  IInstrumentation: IInstrumentation;
}

export interface RgpdWorkerSettings {
  emailRetentionDays: number;
  sweepBatchSize: number;
  sweepDeadlineMs: number;
}

export function startRgpdWorkers(
  deps: RgpdWorkerDeps,
  settings: RgpdWorkerSettings,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  const onError = (err: unknown) => deps.IInstrumentation.capture(err);

  const wipeDueAccounts = async () => {
    const swept = await deps.RgpdService.processPendingDeletions({
      now: new Date(),
      batchSize: settings.sweepBatchSize,
      deadlineMs: settings.sweepDeadlineMs,
    });
    if (swept.isFailure) logger.warn({ code: swept.getError().code }, "rgpd sweep failed");
  };

  const purgeSentEmails = () =>
    sweepSentEmails({
      uow: deps.ITransactionService,
      instrumentation: deps.IInstrumentation,
      logger,
      retentionDays: settings.emailRetentionDays,
      deadlineMs: settings.sweepDeadlineMs,
    });

  return Promise.all([
    startPeriodic(wipeDueAccounts, RGPD_TICK_MS, signal, { onError }),
    startPeriodic(purgeSentEmails, RGPD_TICK_MS, signal, { onError }),
  ]).then(() => undefined);
}
