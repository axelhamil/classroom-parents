import { beforeEach, describe, expect, it } from "bun:test";
import {
  DEFAULT_SYNC_CADENCE,
  type SyncDueChildrenService,
  type SyncTickReport,
} from "@modules/classroom-sync/application/services/sync-due-children.service";
import { type AppError, type ILogger, Result } from "@packages/ddd-kit";
import { mockPort, type PortMock } from "@packages/test/bun";
import { drainDueChildren, SYNC_TICK_MS } from "../workers/sync-worker";

type Syncer = Pick<SyncDueChildrenService, "runOnce">;

const FULL = DEFAULT_SYNC_CADENCE.claimSize;

let syncer: PortMock<Syncer>;
let logger: PortMock<ILogger>;

function report(children: number): Result<SyncTickReport, AppError> {
  return Result.ok({ children, failures: 0 });
}

function deps() {
  return { SyncDueChildrenService: syncer };
}

beforeEach(() => {
  syncer = mockPort<Syncer>();
  logger = mockPort<ILogger>();
});

describe("drainDueChildren", () => {
  it("given a backlog of full batches then a partial one, then every due child is synced in the same tick", async () => {
    syncer.runOnce
      .mockResolvedValueOnce(report(FULL))
      .mockResolvedValueOnce(report(FULL))
      .mockResolvedValueOnce(report(FULL))
      .mockResolvedValueOnce(report(12));

    await drainDueChildren(deps(), new AbortController().signal, logger);

    expect(syncer.runOnce).toHaveBeenCalledTimes(4);
  });

  it("given a backlog that never empties, then the tick stops once its time budget is spent", async () => {
    let now = 0;
    syncer.runOnce.mockImplementation(async () => {
      now += SYNC_TICK_MS / 4;
      return report(FULL);
    });

    await drainDueChildren(deps(), new AbortController().signal, logger, () => now);

    expect(syncer.runOnce).toHaveBeenCalledTimes(4);
    expect(now).toBe(SYNC_TICK_MS);
  });

  it("given the server stops, then no further batch is claimed", async () => {
    const controller = new AbortController();
    syncer.runOnce.mockImplementation(async () => {
      controller.abort();
      return report(FULL);
    });

    await drainDueChildren(deps(), controller.signal, logger);

    expect(syncer.runOnce).toHaveBeenCalledTimes(1);
  });

  it("given a failing claim, then the tick stops and warns", async () => {
    syncer.runOnce.mockResolvedValue(
      Result.fail({ code: "SYNC_PROVIDER_FAILURE", message: "down" }),
    );

    await drainDueChildren(deps(), new AbortController().signal, logger);

    expect(syncer.runOnce).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
