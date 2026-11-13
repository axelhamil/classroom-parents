import type { AppError, ILogger, Result } from "@packages/ddd-kit";

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
): Promise<void> {
  const startedAt = clock();

  while (!signal.aborted && clock() - startedAt < budgetMs) {
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
