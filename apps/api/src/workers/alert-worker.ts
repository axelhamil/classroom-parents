import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import { startPeriodic } from "./periodic";

export const ALERT_TICK_MS = 30_000;

export interface AlertWorkerDeps {
  AlertDispatchService: Pick<AlertDispatchService, "runOnce">;
  IInstrumentation: IInstrumentation;
}

export function startAlertWorkers(
  deps: AlertWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
): Promise<void> {
  const dispatchDue = async () => {
    const tick = await deps.AlertDispatchService.runOnce(new Date());
    if (tick.isFailure) logger.warn({ code: tick.getError().code }, "alert dispatch failed");
    else if (tick.getValue().claimed > 0) logger.info(tick.getValue(), "alert dispatch done");
  };

  return startPeriodic(dispatchDue, ALERT_TICK_MS, signal, {
    onError: (err) => deps.IInstrumentation.capture(err),
  });
}
