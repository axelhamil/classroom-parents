import type { AiUsageWatchService } from "@modules/assistant/application/services/ai-usage-watch.service";
import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import { failed, type JobOutcome, succeeded } from "./job";
import { startPeriodic } from "./periodic";

export const AI_USAGE_WATCH_TICK_MS = 10 * 60_000;

export interface AiUsageWorkerDeps {
  AiUsageWatchService: Pick<AiUsageWatchService, "watch">;
  IInstrumentation: IInstrumentation;
}

export async function aiUsageWatchPass(
  deps: Pick<AiUsageWorkerDeps, "AiUsageWatchService">,
  logger: ILogger,
): Promise<JobOutcome> {
  const watched = await deps.AiUsageWatchService.watch();
  if (watched.isFailure) {
    const { code, cause } = watched.getError();
    logger.warn({ code, err: cause }, "ai usage watch failed");
    return failed(code, {}, watched.getError());
  }

  return succeeded({ ...watched.getValue() });
}

export function startAiUsageWorker(
  deps: AiUsageWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
): Promise<void> {
  return startPeriodic(() => aiUsageWatchPass(deps, logger), AI_USAGE_WATCH_TICK_MS, signal, {
    onError: (err: unknown) => deps.IInstrumentation.capture(err),
  });
}
