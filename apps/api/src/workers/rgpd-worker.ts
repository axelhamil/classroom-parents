import type { IInstrumentation, IUnitOfWork } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import type { RgpdService } from "../modules/rgpd/application/services/rgpd.service";
import type { SweepResponse } from "../shared/internal-routes/sweep-runner";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";
import { failed, type Job, type JobOutcome, succeeded } from "./job";
import { startPeriodic } from "./periodic";
import { sweepDeliveredOutbox, sweepEventHistory, sweepOldEmails } from "./retention";

export const RGPD_TICK_MS = 60 * 60_000;

export interface RgpdWorkerDeps {
  RgpdService: Pick<RgpdService, "processPendingDeletions">;
  ITransactionService: IUnitOfWork;
  IInstrumentation: IInstrumentation;
  ISweepRunStore: ISweepRunStore;
  IOutboxRepository: IOutboxRepository;
}

export interface RgpdWorkerSettings {
  emailRetentionDays: number;
  emailDeadReplayWindowHours: number;
  sweepBatchSize: number;
  sweepDeadlineMs: number;
}

function sweepOutcome(response: SweepResponse): JobOutcome {
  const counts = {
    deleted: response.deleted,
    batches: response.batchCount,
    skipped: response.skipped ? 1 : 0,
    truncated: response.truncated ? 1 : 0,
  };
  const batchError = Object.values(response.stopReasons).includes("batch-error");

  return batchError ? failed("SWEEP_BATCH_ERROR", counts) : succeeded(counts);
}

export function sweepJobs(
  deps: RgpdWorkerDeps,
  settings: RgpdWorkerSettings,
  logger: Logger,
): Job[] {
  const retention = {
    uow: deps.ITransactionService,
    instrumentation: deps.IInstrumentation,
    sweepRuns: deps.ISweepRunStore,
    logger,
    deadlineMs: settings.sweepDeadlineMs,
  };

  const wipeDueAccounts = async (): Promise<JobOutcome> => {
    const swept = await deps.RgpdService.processPendingDeletions({
      now: new Date(),
      batchSize: settings.sweepBatchSize,
      deadlineMs: settings.sweepDeadlineMs,
    });
    if (swept.isFailure) {
      const { code, cause } = swept.getError();
      logger.warn({ code, err: cause }, "rgpd sweep failed");
      return failed(code, {}, swept.getError());
    }

    const { processed, failed: failures } = swept.getValue();
    const counts = { processed, failed: failures.length };
    return failures.length > 0 ? failed("RGPD_WIPE_FAILED", counts) : succeeded(counts);
  };

  return [
    { name: "account-wipes", run: wipeDueAccounts },
    {
      name: "email-retention",
      run: async () =>
        sweepOutcome(
          await sweepOldEmails({
            ...retention,
            retentionDays: settings.emailRetentionDays,
            deadReplayWindowHours: settings.emailDeadReplayWindowHours,
          }),
        ),
    },
    {
      name: "outbox-retention",
      run: async () => sweepOutcome(await sweepDeliveredOutbox(retention)),
    },
    {
      name: "event-history-retention",
      run: async () =>
        sweepOutcome(await sweepEventHistory({ ...retention, outbox: deps.IOutboxRepository })),
    },
  ];
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

  return Promise.all(
    sweepJobs(deps, settings, logger).map((job) =>
      startPeriodic(() => job.run(signal), RGPD_TICK_MS, signal, options),
    ),
  ).then(() => undefined);
}
