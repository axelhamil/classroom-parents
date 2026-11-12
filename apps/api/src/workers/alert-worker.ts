import { DISPATCH_BATCH } from "@modules/alerts/application/config/dispatch-budget";
import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { WeeklyDigestService } from "@modules/alerts/application/services/weekly-digest.service";
import type { AppError, IInstrumentation, ILogger, Result } from "@packages/ddd-kit";
import { startPeriodic } from "./periodic";

export const ALERT_TICK_MS = 30_000;

export interface AlertWorkerDeps {
  AlertDispatchService: Pick<AlertDispatchService, "runOnce">;
  WeeklyDigestService: Pick<WeeklyDigestService, "runOnce">;
  IInstrumentation: IInstrumentation;
}

type BatchRun = (now: Date) => Promise<Result<{ claimed: number }, AppError>>;

async function drain(
  run: BatchRun,
  drained: (claimed: number) => boolean,
  label: string,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number,
): Promise<void> {
  const startedAt = clock();

  while (!signal.aborted && clock() - startedAt < ALERT_TICK_MS) {
    const tick = await run(new Date(clock()));
    if (tick.isFailure) {
      const { code, cause } = tick.getError();
      logger.warn({ code, err: cause }, `${label} failed`);
      return;
    }

    const { claimed } = tick.getValue();
    if (claimed > 0) logger.info(tick.getValue(), `${label} done`);
    if (drained(claimed)) return;
  }
}

export function drainDueAlerts(
  deps: Pick<AlertWorkerDeps, "AlertDispatchService">,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number = Date.now,
): Promise<void> {
  return drain(
    (now) => deps.AlertDispatchService.runOnce(now),
    (claimed) => claimed === 0,
    "alert dispatch",
    signal,
    logger,
    clock,
  );
}

export function drainWeeklyDigests(
  deps: Pick<AlertWorkerDeps, "WeeklyDigestService">,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number = Date.now,
): Promise<void> {
  return drain(
    (now) => deps.WeeklyDigestService.runOnce(now),
    (claimed) => claimed < DISPATCH_BATCH,
    "weekly digest",
    signal,
    logger,
    clock,
  );
}

export function startAlertWorkers(
  deps: AlertWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
): Promise<void> {
  const tick = async () => {
    await drainDueAlerts(deps, signal, logger);
    await drainWeeklyDigests(deps, signal, logger);
  };

  return startPeriodic(tick, ALERT_TICK_MS, signal, {
    onError: (err) => deps.IInstrumentation.capture(err),
  });
}
