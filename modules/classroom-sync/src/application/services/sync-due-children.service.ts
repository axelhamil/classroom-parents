import { type AppError, type IInstrumentation, Result } from "@packages/ddd-kit";
import type { IDueChildren } from "../ports/due-children.port";
import { runPooled } from "./run-pooled";
import type { SyncChildService } from "./sync-child.service";

const CLAIM_LIMIT = 4;

export interface SyncTickReport {
  children: number;
  failures: number;
}

export class SyncDueChildrenService {
  constructor(
    private readonly due: IDueChildren,
    private readonly sync: Pick<SyncChildService, "syncChild">,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async runOnce(now: Date): Promise<Result<SyncTickReport, AppError>> {
    return this.instrumentation.startSpan(
      { name: "SyncDueChildrenService > runOnce", op: "function" },
      async () => {
        const claimed = await this.due.claimDue(CLAIM_LIMIT, now);
        if (claimed.isFailure) return Result.fail(claimed.getError());

        const children = claimed.getValue();
        const synced = await runPooled(children, CLAIM_LIMIT, (child) =>
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
