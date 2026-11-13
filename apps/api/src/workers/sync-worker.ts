import type { ChildConnectionService } from "@modules/children/application/services/child-connection.service";
import {
  DEFAULT_SYNC_CADENCE,
  type SyncDueChildrenService,
} from "@modules/classroom-sync/application/services/sync-due-children.service";
import type { IInstrumentation, ILogger } from "@packages/ddd-kit";
import { drain } from "./drain";
import { startPeriodic } from "./periodic";

export const SYNC_TICK_MS = 60_000;
export const DISCONNECT_RESUME_TICK_MS = 60_000;
const DISCONNECT_RESUME_BATCH = 20;

export interface SyncWorkerDeps {
  SyncDueChildrenService: Pick<SyncDueChildrenService, "runOnce">;
  ChildConnectionService: Pick<ChildConnectionService, "resumeDisconnections">;
  IInstrumentation: IInstrumentation;
}

export function drainDueChildren(
  deps: Pick<SyncWorkerDeps, "SyncDueChildrenService">,
  signal: AbortSignal,
  logger: ILogger,
  clock: () => number = Date.now,
): Promise<void> {
  return drain(
    {
      run: async (now) =>
        (await deps.SyncDueChildrenService.runOnce(now)).map(({ children, failures }) => ({
          claimed: children,
          failures,
        })),
      drained: (claimed) => claimed < DEFAULT_SYNC_CADENCE.claimSize,
      label: "sync tick",
      budgetMs: SYNC_TICK_MS,
    },
    signal,
    logger,
    clock,
  );
}

export function startSyncWorkers(
  deps: SyncWorkerDeps,
  signal: AbortSignal,
  logger: ILogger,
): Promise<void> {
  const onError = (err: unknown) => deps.IInstrumentation.capture(err);

  const syncDue = () => drainDueChildren(deps, signal, logger);

  const resumeDisconnections = async () => {
    const resumed = await deps.ChildConnectionService.resumeDisconnections(
      DISCONNECT_RESUME_BATCH,
      new Date(),
    );
    if (resumed.isFailure) {
      const { code, cause } = resumed.getError();
      logger.warn({ code, err: cause }, "disconnection resume failed");
    } else if (resumed.getValue().finished + resumed.getValue().failed > 0)
      logger.info(resumed.getValue(), "disconnections resumed");
  };

  return Promise.all([
    startPeriodic(syncDue, SYNC_TICK_MS, signal, { onError }),
    startPeriodic(resumeDisconnections, DISCONNECT_RESUME_TICK_MS, signal, { onError }),
  ]).then(() => undefined);
}
