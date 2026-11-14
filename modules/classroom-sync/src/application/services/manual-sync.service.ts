import { type IBackgroundWork, type IInstrumentation, Result } from "@packages/ddd-kit";
import type { IManualSyncGate } from "../ports/manual-sync-gate.port";
import type { SyncError } from "../sync-error";
import type { SyncChildService } from "./sync-child.service";

export type ManualSyncStatus = "started" | "throttled";

export interface ManualSyncOutcome {
  status: ManualSyncStatus;
  retryAt: Date;
}

const NOTHING_TO_SYNC: readonly SyncError["code"][] = ["SYNC_CHILD_NOT_FOUND", "SYNC_BLOCKED"];

export function isNothingToSync(error: SyncError): boolean {
  return NOTHING_TO_SYNC.includes(error.code);
}

function combined(outcomes: ManualSyncOutcome[], now: Date): ManualSyncOutcome {
  const status = outcomes.some(({ status }) => status === "started") ? "started" : "throttled";
  if (outcomes.length === 0) return { status, retryAt: now };

  return {
    status,
    retryAt: new Date(Math.min(...outcomes.map(({ retryAt }) => retryAt.getTime()))),
  };
}

export class ManualSyncService {
  constructor(
    private readonly gate: IManualSyncGate,
    private readonly sync: Pick<SyncChildService, "syncChild">,
    private readonly background: IBackgroundWork,
    private readonly instrumentation: IInstrumentation,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async requestChild(
    userId: string,
    childId: string,
  ): Promise<Result<ManualSyncOutcome, SyncError>> {
    return this.instrumentation.startSpan(
      { name: "ManualSyncService > requestChild", op: "function" },
      () => this.start(userId, childId),
    );
  }

  async requestAll(userId: string): Promise<Result<ManualSyncOutcome, SyncError>> {
    return this.instrumentation.startSpan(
      { name: "ManualSyncService > requestAll", op: "function" },
      async () => {
        const childIds = await this.gate.childIdsOf(userId);
        if (childIds.isFailure) return Result.fail(childIds.getError());

        const outcomes: ManualSyncOutcome[] = [];
        for (const childId of childIds.getValue()) {
          const started = await this.start(userId, childId);
          if (started.isFailure && !isNothingToSync(started.getError()))
            return Result.fail(started.getError());
          if (started.isSuccess) outcomes.push(started.getValue());
        }
        return Result.ok(combined(outcomes, this.clock()));
      },
    );
  }

  private async start(
    userId: string,
    childId: string,
  ): Promise<Result<ManualSyncOutcome, SyncError>> {
    const now = this.clock();
    const claimed = await this.gate.claim(userId, childId, now);
    if (claimed.isFailure) return Result.fail(claimed.getError());

    const claim = claimed.getValue();
    if (claim.outcome !== "started")
      return Result.ok({ status: "throttled", retryAt: claim.retryAt });

    this.background.defer(
      this.sync.syncChild({ userId, childId, label: claim.label, lease: claim.lease }, now),
    );
    return Result.ok({ status: "started", retryAt: claim.retryAt });
  }
}
