import { beforeEach, describe, expect, it } from "bun:test";
import type { AlertDispatchService } from "@modules/alerts/application/services/alert-dispatch.service";
import type { WeeklyDigestService } from "@modules/alerts/application/services/weekly-digest.service";
import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";
import type { SyncDueChildrenService } from "@modules/classroom-sync/application/services/sync-due-children.service";
import { type IInstrumentation, type ILogger, type IUnitOfWork, Result } from "@packages/ddd-kit";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { mockPort, type PortMock } from "@packages/test/bun";
import type { RgpdService } from "../modules/rgpd/application/services/rgpd.service";
import type { Logger } from "../shared/logger";
import type { ISweepRunStore } from "../shared/ports/sweep-run.port";
import { ClockService, runJobs, runPhases } from "../workers/clock";
import type { DeliveryDrain } from "../workers/delivery";
import { failed, type Job, succeeded } from "../workers/job";

let instrumentation: PortMock<IInstrumentation>;
let logger: PortMock<ILogger>;

beforeEach(() => {
  instrumentation = mockPort<IInstrumentation>();
  logger = mockPort<ILogger>();
});

function options() {
  return { budgetMs: 1_000, instrumentation, logger };
}

describe("runJobs", () => {
  it("given every job succeeds, then the report lists each job with its counts and is ok", async () => {
    const jobs: Job[] = [
      { name: "outbox", run: async () => succeeded({ dispatched: 3 }) },
      { name: "emails", run: async () => succeeded({ claimed: 1 }) },
    ];

    const report = await runJobs(jobs, options());

    expect(report.ok).toBe(true);
    expect(report.jobs.map(({ job, ok, counts }) => ({ job, ok, counts }))).toEqual([
      { job: "outbox", ok: true, counts: { dispatched: 3 } },
      { job: "emails", ok: true, counts: { claimed: 1 } },
    ]);
  });

  it("given one job fails, then the others still run, the report is not ok and the failure reaches telemetry", async () => {
    let alertsRan = false;
    const jobs: Job[] = [
      { name: "sync", run: async () => failed("SYNC_CLAIM_FAILED", { claimed: 0 }) },
      {
        name: "alerts",
        run: async () => {
          alertsRan = true;
          return succeeded({ claimed: 2 });
        },
      },
    ];

    const report = await runJobs(jobs, options());

    expect(alertsRan).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.jobs[0]).toMatchObject({ job: "sync", ok: false, code: "SYNC_CLAIM_FAILED" });
    expect(report.jobs[1]).toMatchObject({ job: "alerts", ok: true });
    expect(instrumentation.capture).toHaveBeenCalledTimes(1);
  });

  it("given a job throws, then it is reported as crashed without stopping the others", async () => {
    const jobs: Job[] = [
      {
        name: "outbox",
        run: async () => {
          throw new Error("connection reset");
        },
      },
      { name: "emails", run: async () => succeeded({ claimed: 0 }) },
    ];

    const report = await runJobs(jobs, options());

    expect(report.jobs[0]).toMatchObject({ job: "outbox", ok: false, code: "JOB_CRASHED" });
    expect(report.jobs[1]).toMatchObject({ job: "emails", ok: true });
  });

  it("given a time budget, then every job receives a signal that aborts once it is spent", async () => {
    const deadline = new AbortController();
    const seen: AbortSignal[] = [];
    const jobs: Job[] = [
      {
        name: "sync",
        run: async (signal) => {
          seen.push(signal);
          return succeeded({});
        },
      },
    ];

    await runJobs(jobs, { ...options(), deadline: () => deadline.signal });
    deadline.abort();

    expect(seen[0]?.aborted).toBe(true);
  });
});

describe("ClockService", () => {
  function clock() {
    const outbox: string[] = [];
    const emailQueue: string[] = [];
    const pushed: string[] = [];
    const emailed: string[] = [];

    const sync = mockPort<SyncDueChildrenService>();
    sync.runOnce.mockResolvedValue(Result.ok({ children: 0, failures: 0 }));
    const connections = mockPort<ChildConnectionService>();
    connections.resumeDisconnections.mockResolvedValue(Result.ok({ finished: 0, failed: 0 }));
    const dispatch = mockPort<AlertDispatchService>();
    let due = ["reminder"];
    dispatch.runOnce.mockImplementation(async () => {
      const claimed = due.length;
      for (const alertId of due) {
        pushed.push(alertId);
        outbox.push(alertId);
      }
      due = [];
      return Result.ok({ claimed, sent: claimed, emailed: 0, missed: 0 });
    });
    const digest = mockPort<WeeklyDigestService>();
    digest.runOnce.mockResolvedValue(
      Result.ok({ planned: 0, claimed: 0, sent: 0, emailed: 0, skipped: 0, missed: 0 }),
    );
    const delivery = mockPort<Pick<DeliveryDrain, "outbox" | "emails">>();
    delivery.outbox.mockImplementation(async () => {
      const dispatched = outbox.length;
      emailQueue.push(...outbox.splice(0));
      return succeeded({ dispatched });
    });
    delivery.emails.mockImplementation(async () => {
      const claimed = emailQueue.length;
      emailed.push(...emailQueue.splice(0));
      return succeeded({ claimed });
    });

    const service = new ClockService(
      {
        SyncDueChildrenService: sync,
        ChildConnectionService: connections,
        AlertDispatchService: dispatch,
        WeeklyDigestService: digest,
        RgpdService: mockPort<RgpdService>(),
        ITransactionService: mockPort<IUnitOfWork>(),
        IInstrumentation: instrumentation,
        ISweepRunStore: mockPort<ISweepRunStore>(),
        IOutboxRepository: mockPort<IOutboxRepository>(),
        DeliveryDrain: delivery,
      },
      {
        tickBudgetMs: 1_000,
        sweep: {
          emailRetentionDays: 30,
          emailDeadReplayWindowHours: 72,
          sweepBatchSize: 100,
          sweepDeadlineMs: 1_000,
        },
      },
      mockPort<Logger>(),
    );

    return { service, pushed, emailed };
  }

  it("given a reminder due at tick time, then that same tick pushes it and sends its email", async () => {
    const { service, pushed, emailed } = clock();

    const report = await service.tick();

    expect(report.ok).toBe(true);
    expect(pushed).toEqual(["reminder"]);
    expect(emailed).toEqual(["reminder"]);
  });
});

describe("runPhases", () => {
  it("given a producer that uses its whole slice, then delivery still gets a slice of its own", async () => {
    let deliverySignal: AbortSignal | undefined;
    const producer: Job = {
      name: "sync",
      run: (signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(succeeded({})), { once: true }),
        ),
    };
    const consumer: Job = {
      name: "outbox",
      run: async (signal) => {
        deliverySignal = signal;
        return succeeded({});
      },
    };

    const report = await runPhases(
      [
        { jobs: [producer], budgetMs: 20 },
        { jobs: [consumer], budgetMs: 1_000 },
      ],
      options(),
    );

    expect(report.ok).toBe(true);
    expect(deliverySignal?.aborted).toBe(false);
  });
});
