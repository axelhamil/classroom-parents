import { raceWithTimeout } from "@packages/outbox/race-with-timeout";

export interface PeriodicOptions {
  onError: (err: unknown) => void;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  runAtStart?: boolean;
}

function aborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return raceWithTimeout(aborted(signal), ms, () => undefined);
}

export async function startPeriodic(
  task: () => Promise<unknown>,
  intervalMs: number,
  signal: AbortSignal,
  options: PeriodicOptions,
): Promise<void> {
  const sleep = options.sleep ?? sleepUnlessAborted;
  let first = options.runAtStart === true;

  while (!signal.aborted) {
    if (!first) await sleep(intervalMs, signal);
    first = false;
    if (signal.aborted) return;

    try {
      await task();
    } catch (err) {
      options.onError(err);
    }
  }
}
