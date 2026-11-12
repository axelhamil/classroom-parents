import { DISPATCH_BATCH } from "@modules/alerts/application/config/dispatch-budget";
import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import { startPeriodic } from "./periodic";

export const ALERT_TICK_MS = 30_000;

export interface AlertWorkerDeps {
  AlertDispatchService: Pick<AlertDispatchService, "runOnce">;
  IInstrumentation: IInstrumentation;
}

export async function drainDueAlerts(
  deps: AlertWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number = Date.now,
): Promise<void> {
  const startedAt = clock();

  while (!signal.aborted && clock() - startedAt < ALERT_TICK_MS) {
    const tick = await deps.AlertDispatchService.runOnce(new Date(clock()));
    if (tick.isFailure) {
      const { code, cause } = tick.getError();
      logger.warn({ code, err: cause }, "alert dispatch failed");
      return;
    }

    const { claimed } = tick.getValue();
    if (claimed > 0) logger.info(tick.getValue(), "alert dispatch done");
    if (claimed < DISPATCH_BATCH) return;
  }
}

export function startAlertWorkers(
  deps: AlertWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
): Promise<void> {
  return startPeriodic(() => drainDueAlerts(deps, signal, logger), ALERT_TICK_MS, signal, {
    onError: (err) => deps.IInstrumentation.capture(err),
  });
}
