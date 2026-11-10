import { beforeEach, describe, expect, it } from "bun:test";
import { Result } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { mockPort, type PortMock } from "@packages/test/bun";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { onChildConnected } from "../application/event-handlers/on-child-connected";
import type { IManualSyncGate, ManualSyncClaim } from "../application/ports/manual-sync-gate.port";
import { ManualSyncService } from "../application/services/manual-sync.service";
import type { SyncError } from "../application/sync-error";
import { CHILD, NOW, type SyncHarness, syncHarness } from "./sync-harness";

let h: SyncHarness;
let gate: PortMock<IManualSyncGate>;
let manual: ManualSyncService;

const connected = (payload: unknown) => ({
  eventType: EventTypes.CHILD_CONNECTED,
  dateOccurred: NOW,
  aggregateId: CHILD.childId,
  payload,
});

const claims = (claim: ManualSyncClaim) =>
  gate.claim.mockResolvedValue(Result.ok<ManualSyncClaim, SyncError>(claim));

beforeEach(() => {
  h = syncHarness();
  gate = mockPort<IManualSyncGate>();
  manual = new ManualSyncService(gate, h.service, mockInstrumentation(), () => NOW);
});

describe("on child connected", () => {
  it("starts the child's first sync through the gate", async () => {
    claims({ outcome: "started", lease: CHILD.lease, label: CHILD.label });
    const handler = onChildConnected({ ManualSyncService: manual });

    await handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId }));
    await manual.settled();

    expect(gate.claim).toHaveBeenCalledWith(CHILD.userId, CHILD.childId, NOW);
    expect(h.client.listCourses).toHaveBeenCalledTimes(1);
    expect(h.state.markSynced.mock.calls[0]?.[0]).toEqual({
      childId: CHILD.childId,
      lease: CHILD.lease,
    });
  });

  for (const outcome of ["throttled", "running"] as const) {
    it(`starts no second sync when the gate answers ${outcome}`, async () => {
      claims({ outcome });
      const handler = onChildConnected({ ManualSyncService: manual });

      await handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId }));
      await manual.settled();

      expect(h.tokens.accessTokenFor).not.toHaveBeenCalled();
      expect(h.client.listCourses).not.toHaveBeenCalled();
    });
  }

  it("does nothing for a child gone or blocked since it was connected", async () => {
    gate.claim.mockResolvedValue(
      Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_CHILD_NOT_FOUND", message: "gone" }),
    );
    const handler = onChildConnected({ ManualSyncService: manual });

    await handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId }));

    expect(h.client.listCourses).not.toHaveBeenCalled();
  });

  it("fails the delivery so it is retried when the gate cannot answer", async () => {
    gate.claim.mockResolvedValue(
      Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_PROVIDER_FAILURE", message: "db" }),
    );
    const handler = onChildConnected({ ManualSyncService: manual });

    await expect(
      handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId })),
    ).rejects.toThrow("SYNC_PROVIDER_FAILURE");
  });
});

describe("sync on app open", () => {
  it("starts every child it may, skipping blocked ones", async () => {
    gate.childIdsOf.mockResolvedValue(Result.ok<string[], SyncError>(["c1", "c2", "c3"]));
    gate.claim.mockImplementation(async (_userId, childId) => {
      if (childId === "c1")
        return Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_BLOCKED", message: "école" });
      if (childId === "c2") return Result.ok<ManualSyncClaim, SyncError>({ outcome: "throttled" });
      return Result.ok<ManualSyncClaim, SyncError>({ outcome: "started", lease: 1, label: "Tom" });
    });

    const result = await manual.requestAll(CHILD.userId);
    await manual.settled();

    expect(result.getValue()).toBe("started");
    expect(h.client.listCourses).toHaveBeenCalledTimes(1);
  });

  it("answers throttled when no child was started", async () => {
    gate.childIdsOf.mockResolvedValue(Result.ok<string[], SyncError>(["c1"]));
    claims({ outcome: "running" });

    const result = await manual.requestAll(CHILD.userId);

    expect(result.getValue()).toBe("throttled");
  });

  it("refuses a manual sync of a blocked child with the reason", async () => {
    gate.claim.mockResolvedValue(
      Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_BLOCKED", message: "école" }),
    );

    const result = await manual.requestChild(CHILD.userId, CHILD.childId);

    expect(result.getError()).toEqual({ code: "SYNC_BLOCKED", message: "école" });
  });
});
