import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import type { Logger } from "../shared/logger";
import { type AlertWorkerDeps, alertsPass } from "./alert-worker";
import type { DeliveryDrain } from "./delivery";
import { failed, type Job, type JobCounts, type JobOutcome } from "./job";
import { type RgpdWorkerDeps, type RgpdWorkerSettings, sweepJobs } from "./rgpd-worker";
import { type SyncWorkerDeps, syncPass } from "./sync-worker";

export interface JobReport {
  job: string;
  ok: boolean;
  counts: JobCounts;
  durationMs: number;
  code?: string;
}

export interface ClockReport {
  ok: boolean;
  durationMs: number;
  jobs: JobReport[];
}

export interface RunJobsOptions {
  budgetMs: number;
  instrumentation: IInstrumentation;
  logger: ILogger;
  clock?: () => number;
  deadline?: (ms: number) => AbortSignal;
}

export interface Phase {
  jobs: readonly Job[];
  budgetMs: number;
}

export const PRODUCERS_SHARE = 0.5;
export const OUTBOX_SHARE = 0.3;
export const EMAILS_SHARE = 0.2;

async function runJob(job: Job, signal: AbortSignal, options: RunJobsOptions): Promise<JobReport> {
  const clock = options.clock ?? Date.now;
  const startedAt = clock();
  const outcome = await job
    .run(signal)
    .catch((err: unknown): JobOutcome => failed("JOB_CRASHED", {}, err));
  const durationMs = clock() - startedAt;
  if (outcome.ok) return { job: job.name, ok: true, counts: outcome.counts, durationMs };

  options.logger.warn(
    { job: job.name, code: outcome.code, err: outcome.cause },
    "clock job failed",
  );
  options.instrumentation.capture(outcome.cause ?? new Error(`${job.name} failed`), {
    metadata: { job: job.name, code: outcome.code, counts: outcome.counts },
  });
  return { job: job.name, ok: false, counts: outcome.counts, durationMs, code: outcome.code };
}

export async function runPhases(
  phases: readonly Phase[],
  options: RunJobsOptions,
): Promise<ClockReport> {
  const clock = options.clock ?? Date.now;
  const deadline = options.deadline ?? AbortSignal.timeout;
  const startedAt = clock();
  const reports: JobReport[] = [];

  for (const phase of phases) {
    const signal = deadline(Math.floor(phase.budgetMs));
    reports.push(...(await Promise.all(phase.jobs.map((job) => runJob(job, signal, options)))));
  }

  return {
    ok: reports.every((report) => report.ok),
    durationMs: clock() - startedAt,
    jobs: reports,
  };
}

export function runJobs(jobs: readonly Job[], options: RunJobsOptions): Promise<ClockReport> {
  return runPhases([{ jobs, budgetMs: options.budgetMs }], options);
}

export type ClockDeps = Pick<
  SyncWorkerDeps,
  "SyncDueChildrenService" | "ChildConnectionService" | "IInstrumentation"
> &
  Pick<AlertWorkerDeps, "AlertDispatchService" | "WeeklyDigestService"> &
  RgpdWorkerDeps & { DeliveryDrain: Pick<DeliveryDrain, "outbox" | "emails"> };

export interface ClockSettings {
  tickBudgetMs: number;
  sweep: RgpdWorkerSettings;
}

export class ClockService {
  constructor(
    private readonly deps: ClockDeps,
    private readonly settings: ClockSettings,
    private readonly logger: Logger,
  ) {}

  tick(): Promise<ClockReport> {
    const { deps, logger } = this;
    const budgetMs = this.settings.tickBudgetMs;

    return runPhases(
      [
        {
          jobs: [
            { name: "sync", run: (signal) => syncPass(deps, signal, logger) },
            { name: "alerts", run: (signal) => alertsPass(deps, signal, logger) },
          ],
          budgetMs: budgetMs * PRODUCERS_SHARE,
        },
        {
          jobs: [{ name: "outbox", run: (signal) => deps.DeliveryDrain.outbox(signal) }],
          budgetMs: budgetMs * OUTBOX_SHARE,
        },
        {
          jobs: [{ name: "emails", run: (signal) => deps.DeliveryDrain.emails(signal) }],
          budgetMs: budgetMs * EMAILS_SHARE,
        },
      ],
      { budgetMs, instrumentation: deps.IInstrumentation, logger },
    );
  }

  sweep(): Promise<ClockReport> {
    return runJobs(sweepJobs(this.deps, this.settings.sweep, this.logger), {
      budgetMs: this.settings.sweep.sweepDeadlineMs,
      instrumentation: this.deps.IInstrumentation,
      logger: this.logger,
    });
  }
}
