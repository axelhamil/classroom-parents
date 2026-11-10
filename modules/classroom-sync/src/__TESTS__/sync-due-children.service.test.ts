import { describe, expect, it } from "bun:test";
import { type AppError, Result } from "@packages/ddd-kit";
import { mockPort } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import type { ClassroomError, Course } from "../application/ports/classroom-client.port";
import type { ChildToSync, IDueChildren } from "../application/ports/due-children.port";
import type { SyncReport } from "../application/services/sync-child.service";
import {
  DEFAULT_SYNC_CADENCE,
  SyncDueChildrenService,
} from "../application/services/sync-due-children.service";
import type { SyncError } from "../application/sync-error";
import { classroomFailure, NOW, syncHarness } from "./sync-harness";

const claimed: ChildToSync[] = [1, 2, 3].map((n) => ({
  childId: `child-${n}`,
  userId: `parent-${n}`,
  label: `Enfant ${n}`,
  lease: n,
}));

describe("runOnce", () => {
  it("syncs every claimed child even when one of them fails", async () => {
    const h = syncHarness();
    const due = mockPort<IDueChildren>();
    due.claimDue.mockResolvedValue(Result.ok<ChildToSync[], AppError>(claimed));
    h.tokens.accessTokenFor.mockImplementation(async (childId) => Result.ok(`token-${childId}`));
    h.client.listCourses.mockImplementation(async (token) =>
      token === "token-child-2"
        ? classroomFailure<Course[]>("CLASSROOM_PROVIDER_FAILURE")
        : Result.ok<Course[], ClassroomError>([]),
    );
    const worker = new SyncDueChildrenService(due, h.service, mockInstrumentation());

    const result = await worker.runOnce(NOW);

    expect(result.getValue()).toEqual({ children: 3, failures: 1 });
    expect(h.state.markSynced.mock.calls.map(([lease]) => lease.childId).sort()).toEqual([
      "child-1",
      "child-3",
    ]);
    expect(h.state.markSyncFailed.mock.calls.map(([lease]) => lease)).toEqual([
      { childId: "child-2", lease: 2 },
    ]);
  });

  it("claims the due children at the tick's time", async () => {
    const h = syncHarness();
    const due = mockPort<IDueChildren>();
    due.claimDue.mockResolvedValue(Result.ok<ChildToSync[], AppError>([]));
    const worker = new SyncDueChildrenService(due, h.service, mockInstrumentation());

    const result = await worker.runOnce(NOW);

    expect(result.getValue()).toEqual({ children: 0, failures: 0 });
    expect(due.claimDue.mock.calls[0]?.[1]).toEqual(NOW);
  });
});

describe("sync cadence", () => {
  it("claims the configured batch and syncs at most the configured number at once", async () => {
    const due = mockPort<IDueChildren>();
    const nine = Array.from({ length: 9 }, (_, n) => ({
      childId: `child-${n}`,
      userId: `parent-${n}`,
      label: `Enfant ${n}`,
      lease: n,
    }));
    due.claimDue.mockResolvedValue(Result.ok<ChildToSync[], AppError>(nine));
    let running = 0;
    let peak = 0;
    const synced: string[] = [];
    const sync = {
      syncChild: async (child: ChildToSync) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running -= 1;
        synced.push(child.childId);
        return Result.fail<SyncReport, SyncError>({ code: "SYNC_BLOCKED", message: "x" });
      },
    };
    const worker = new SyncDueChildrenService(due, sync, mockInstrumentation(), {
      tickMs: 60_000,
      claimSize: 9,
      parallelism: 3,
    });

    const result = await worker.runOnce(NOW);

    expect(due.claimDue.mock.calls[0]?.[0]).toBe(9);
    expect(peak).toBe(3);
    expect(synced).toHaveLength(9);
    expect(result.getValue()).toEqual({ children: 9, failures: 9 });
  });

  it("claims enough children by default to visit 2,000 of them every 30 minutes", () => {
    const ticksPerHalfHour = (30 * 60_000) / DEFAULT_SYNC_CADENCE.tickMs;

    expect(DEFAULT_SYNC_CADENCE.claimSize * ticksPerHalfHour).toBeGreaterThanOrEqual(2_000);
  });
});
