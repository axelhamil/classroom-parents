export type JobCounts = Record<string, number>;

export type JobOutcome =
  | { ok: true; counts: JobCounts }
  | { ok: false; code: string; counts: JobCounts; cause?: unknown };

export interface Job {
  name: string;
  run: (signal: AbortSignal) => Promise<JobOutcome>;
}

export function succeeded(counts: JobCounts): JobOutcome {
  return { ok: true, counts };
}

export function failed(code: string, counts: JobCounts, cause?: unknown): JobOutcome {
  return { ok: false, code, counts, cause };
}

function prefixed(part: string, counts: JobCounts): JobCounts {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [`${part}.${key}`, value]),
  );
}

export async function inSequence(
  parts: ReadonlyArray<readonly [part: string, run: () => Promise<JobOutcome>]>,
): Promise<JobOutcome> {
  let counts: JobCounts = {};
  let failure: JobOutcome | undefined;

  for (const [part, run] of parts) {
    const outcome = await run();
    counts = { ...counts, ...prefixed(part, outcome.counts) };
    if (!outcome.ok) failure ??= outcome;
  }

  if (failure && !failure.ok) return failed(failure.code, counts, failure.cause);

  return succeeded(counts);
}
