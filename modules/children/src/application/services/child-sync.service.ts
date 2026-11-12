import { type IInstrumentation, type IUnitOfWork, Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { emitEvent } from "@packages/outbox/event-emitter";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import {
  type ChildAccount,
  type ManualSyncRefusal,
  SYNC_LEASE_MS,
} from "../../domain/child-account.aggregate";
import type { ChildStatusValue, ReconnectCause } from "../../domain/value-objects/child-status.vo";
import { childNotFound } from "../errors/children-errors";
import type {
  ChildrenError,
  DueChild,
  IChildRepository,
  SyncLease,
} from "../ports/child-repository.port";
import { ownedChild } from "./owned-child";

export type ManualSyncClaim =
  | { outcome: "started"; lease: SyncLease; label: string; retryAt: Date }
  | { outcome: "running"; retryAt: Date }
  | { outcome: "throttled"; retryAt: Date };

const SYNC_BLOCKED_MESSAGES: Record<Exclude<ChildStatusValue, "connected">, string> = {
  disconnecting: "Cet enfant est en cours de déconnexion.",
  needs_reconnect: "Reconnectez le compte Google de cet enfant pour relancer la synchronisation.",
  blocked_by_school:
    "L'école bloque l'accès à Classroom pour ce compte. Transmettez-lui la procédure affichée sur la fiche de l'enfant.",
};

export class ChildSyncService {
  constructor(
    private readonly children: IChildRepository,
    private readonly transactions: IUnitOfWork,
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async isOwnedBy(userId: string, childId: string): Promise<Result<boolean, ChildrenError>> {
    return this.span("isOwnedBy", async () => {
      const found = await this.children.findOwnedShared(userId, childId);

      return found.map((child) => child.map((owned) => !owned.isDisconnecting()).unwrapOr(false));
    });
  }

  async claimDueForSync(limit: number, now: Date): Promise<Result<DueChild[], ChildrenError>> {
    return this.span("claimDueForSync", () => this.children.claimDue(limit, now, SYNC_LEASE_MS));
  }

  async claimManualSync(
    userId: string,
    childId: string,
    now: Date,
  ): Promise<Result<ManualSyncClaim, ChildrenError>> {
    return this.span("claimManualSync", () =>
      this.transactions.run(async () => {
        const found = await ownedChild(this.children, userId, childId);
        if (found.isFailure) return Result.fail(found.getError());
        const child = found.getValue();

        const requested = child.requestManualSync(now);
        if (requested.isFailure) return this.refusedManualSync(child, requested.getError(), now);

        const saved = await this.children.save(child);
        if (saved.isFailure) return Result.fail(saved.getError());

        await emitEvent(this.outbox, EventTypes.CHILD_SYNC_REQUESTED, "child", childId, {
          userId,
          childId,
          actorUserId: userId,
        });
        return Result.ok<ManualSyncClaim, ChildrenError>({
          outcome: "started",
          lease: { childId, lease: child.get("syncLease") },
          label: child.get("label").value,
          retryAt: child.manualSyncAvailableAt(now),
        });
      }),
    );
  }

  async holdsLease(lease: SyncLease): Promise<Result<boolean, ChildrenError>> {
    return this.span("holdsLease", () => this.children.holdsLease(lease));
  }

  async markSynced(
    lease: SyncLease,
    at: Date,
    nextSyncAt: Date,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("markSynced", () => this.children.markSynced(lease, at, nextSyncAt));
  }

  async markSyncFailed(lease: SyncLease, nextSyncAt: Date): Promise<Result<void, ChildrenError>> {
    return this.span("markSyncFailed", () => this.children.markSyncFailed(lease, nextSyncAt));
  }

  async markNeedsReconnect(
    childId: string,
    cause: ReconnectCause,
  ): Promise<Result<void, ChildrenError>> {
    return this.span("markNeedsReconnect", () =>
      this.transactions.run(async () => {
        const found = await this.children.findForSystem(childId);
        if (found.isFailure) return Result.fail(found.getError());
        if (found.getValue().isNone()) return Result.fail(childNotFound);
        const child = found.getValue().unwrap();

        if (child.markNeedsReconnect(cause).isFailure) return Result.ok<ChildrenError>();

        const saved = await this.children.save(child);
        if (saved.isFailure) return saved;

        await emitEvent(this.outbox, EventTypes.CHILD_NEEDS_RECONNECT, "child", childId, {
          userId: child.get("userId"),
          childId,
          cause,
          actorUserId: null,
        });
        return Result.ok<ChildrenError>();
      }),
    );
  }

  private span<T>(method: string, work: () => Promise<T>): Promise<T> {
    return this.instrumentation.startSpan(
      { name: `ChildSyncService > ${method}`, op: "function" },
      work,
    );
  }

  private refusedManualSync(
    child: ChildAccount,
    refusal: ManualSyncRefusal,
    now: Date,
  ): Result<ManualSyncClaim, ChildrenError> {
    const status = child.get("status").value;
    if (refusal === "unavailable" && status !== "connected")
      return Result.fail({ code: "CHILD_SYNC_BLOCKED", message: SYNC_BLOCKED_MESSAGES[status] });

    const retryAt = child.manualSyncAvailableAt(now);
    if (refusal === "running") return Result.ok({ outcome: "running", retryAt });

    return Result.ok({ outcome: "throttled", retryAt });
  }
}
