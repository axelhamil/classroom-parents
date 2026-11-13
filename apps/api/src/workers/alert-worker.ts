import { DISPATCH_BATCH } from "@modules/alerts/application/config/dispatch-budget";
import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { WeeklyDigestService } from "@modules/alerts/application/services/weekly-digest.service";
import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import { drain } from "./drain";
import { startPeriodic } from "./periodic";

export const ALERT_TICK_MS = 30_000;

export interface AlertWorkerDeps {
  AlertDispatchService: Pick<AlertDispatchService, "runOnce">;
  WeeklyDigestService: Pick<WeeklyDigestService, "runOnce">;
  IInstrumentation: IInstrumentation;
}

export function drainDueAlerts(
  deps: Pick<AlertWorkerDeps, "AlertDispatchService">,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number = Date.now,
): Promise<void> {
  return drain(
    {
      run: (now) => deps.AlertDispatchService.runOnce(now),
      drained: (claimed) => claimed === 0,
      label: "alert dispatch",
      budgetMs: ALERT_TICK_MS,
    },
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
    {
      run: (now) => deps.WeeklyDigestService.runOnce(now),
      drained: (claimed) => claimed < DISPATCH_BATCH,
      label: "weekly digest",
      budgetMs: ALERT_TICK_MS,
    },
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
