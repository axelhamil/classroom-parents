import { type AppError, type IInstrumentation, mapBounded, Result } from "@packages/ddd-kit";
import type { IDueChildren } from "../ports/due-children.port";
import type { SyncChildService } from "./sync-child.service";

export interface SyncCadence {
  tickMs: number;
  claimSize: number;
  parallelism: number;
}

export const DEFAULT_SYNC_CADENCE: SyncCadence = {
  tickMs: 60_000,
  claimSize: 100,
  parallelism: 16,
};

export interface SyncTickReport {
  children: number;
  failures: number;
}

export class SyncDueChildrenService {
  constructor(
    private readonly due: IDueChildren,
    private readonly sync: Pick<SyncChildService, "syncChild">,
    private readonly instrumentation: IInstrumentation,
    private readonly cadence: SyncCadence = DEFAULT_SYNC_CADENCE,
  ) {}

  async runOnce(now: Date): Promise<Result<SyncTickReport, AppError>> {
    return this.instrumentation.startSpan(
      { name: "SyncDueChildrenService > runOnce", op: "function" },
      async () => {
        const claimed = await this.due.claimDue(this.cadence.claimSize, now);
        if (claimed.isFailure) return Result.fail(claimed.getError());

        const children = claimed.getValue();
        const synced = await mapBounded(children, this.cadence.parallelism, (child) =>
          this.sync.syncChild(child, now),
        );
        return Result.ok({
          children: children.length,
          failures: synced.filter((result) => result.isFailure).length,
        });
      },
    );
  }
}
