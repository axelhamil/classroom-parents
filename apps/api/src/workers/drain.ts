import type { AppError, ILogger, Result } from "@packages/ddd-kit";
import { failed, type JobOutcome, succeeded } from "./job";

export type BatchRun = (now: Date) => Promise<Result<{ claimed: number }, AppError>>;

export interface DrainPlan {
  run: BatchRun;
  drained: (claimed: number) => boolean;
  label: string;
  budgetMs: number;
}

export async function drain(
  { run, drained, label, budgetMs }: DrainPlan,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number,
): Promise<JobOutcome> {
  const startedAt = clock();
  let claimed = 0;
  let batches = 0;

  while (!signal.aborted && clock() - startedAt < budgetMs) {
    const tick = await run(new Date(clock()));
    if (tick.isFailure) {
      const { code, cause } = tick.getError();
      logger.warn({ code, err: cause }, `${label} failed`);
      return failed(code, { claimed, batches }, tick.getError());
    }

    const batch = tick.getValue().claimed;
    claimed += batch;
    batches += 1;
    if (batch > 0) logger.info(tick.getValue(), `${label} done`);
    if (drained(batch)) break;
  }

  return succeeded({ claimed, batches });
}
