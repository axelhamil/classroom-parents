import { describe, expect, it } from "bun:test";
import type { IDueChildren } from "@modules/classroom-sync/application/ports/due-children.port";
import { SyncDueChildrenService } from "@modules/classroom-sync/application/services/sync-due-children.service";
import { Result } from "@packages/ddd-kit";
import { NoOpInstrumentation } from "../shared/services/noop-instrumentation";
import { startPeriodic } from "../workers/periodic";
import { SYNC_TICK_MS } from "../workers/sync-worker";

const TICK_MS = 5;
const quiet = () => {};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("startPeriodic", () => {
  it("never overlaps a task slower than its interval", async () => {
    const controller = new AbortController();
    let running = 0;
    let maxRunning = 0;
    let runs = 0;

    const loop = startPeriodic(
      async () => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await wait(TICK_MS * 4);
        running -= 1;
        runs += 1;
      },
      TICK_MS,
      controller.signal,
      { onError: quiet },
    );
    await wait(TICK_MS * 20);
    controller.abort();
    await loop;

    expect(runs).toBeGreaterThan(1);
    expect(maxRunning).toBe(1);
  });

  it("captures a throwing task and still runs the next tick", async () => {
    const controller = new AbortController();
    const captured: unknown[] = [];
    let calls = 0;

    const loop = startPeriodic(
      async () => {
        calls += 1;
        if (calls === 1) throw new Error("tick failed");
      },
      TICK_MS,
      controller.signal,
      { onError: (err) => captured.push(err) },
    );
    await wait(TICK_MS * 10);
    controller.abort();
    await loop;

    expect(captured).toHaveLength(1);
    expect(calls).toBeGreaterThan(1);
  });

  it("runs no further tick once aborted, even mid-wait", async () => {
    const controller = new AbortController();
    let calls = 0;

    const loop = startPeriodic(
      async () => {
        calls += 1;
      },
      60_000,
      controller.signal,
      { onError: quiet },
    );
    controller.abort();
    await loop;
    await wait(TICK_MS * 4);

    expect(calls).toBe(0);
  });
});

describe("sync cadence", () => {
  it("claims a child due now at the next 60 s tick, not 30 min later", async () => {
    const start = new Date("2026-11-09T07:00:00Z").getTime();
    let clock = start;
    const claimedAt: number[] = [];
    let nextSyncAt = start;
    const due: IDueChildren = {
      claimDue: async (_limit: number, now: Date) => {
        if (now.getTime() < nextSyncAt) return Result.ok([]);

        claimedAt.push(now.getTime());
        nextSyncAt = now.getTime() + 30 * 60_000;
        return Result.ok([{ childId: "lea", userId: "parent", label: "Léa", lease: 1 }]);
      },
    };
    const service = new SyncDueChildrenService(
      due,
      {
        syncChild: async () =>
          Result.ok({
            courses: 0,
            skippedCourses: 0,
            newAnnouncements: 0,
            eventsCreated: 0,
            failedAnnouncements: 0,
            failedCoursework: 0,
          }),
      },
      new NoOpInstrumentation(),
    );
    const controller = new AbortController();
    let ticks = 0;

    await startPeriodic(() => service.runOnce(new Date(clock)), SYNC_TICK_MS, controller.signal, {
      onError: quiet,
      sleep: async (ms) => {
        clock += ms;
        ticks += 1;
        if (ticks > 3) controller.abort();
      },
    });

    expect(SYNC_TICK_MS).toBe(60_000);
    expect(claimedAt).toEqual([start + 60_000]);
  });
});
