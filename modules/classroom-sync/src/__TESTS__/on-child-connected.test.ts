import { beforeEach, describe, expect, it } from "bun:test";
import { type IBackgroundWork, Result } from "@packages/ddd-kit";
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
let background: PortMock<IBackgroundWork>;

const deferredWork = () => Promise.all(background.defer.mock.calls.map(([work]) => work));

const connected = (payload: unknown) => ({
  eventType: EventTypes.CHILD_CONNECTED,
  dateOccurred: NOW,
  aggregateId: CHILD.childId,
  payload,
});

const COOLDOWN_END = new Date(NOW.getTime() + 5 * 60_000);
const LATER = new Date(NOW.getTime() + 3 * 60_000);

const claims = (claim: ManualSyncClaim) =>
  gate.claim.mockResolvedValue(Result.ok<ManualSyncClaim, SyncError>(claim));

beforeEach(() => {
  h = syncHarness();
  gate = mockPort<IManualSyncGate>();
  background = mockPort<IBackgroundWork>();
  manual = new ManualSyncService(gate, h.service, background, mockInstrumentation(), () => NOW);
});

describe("on child connected", () => {
  it("starts the child's first sync through the gate", async () => {
    claims({ outcome: "started", lease: CHILD.lease, label: CHILD.label, retryAt: COOLDOWN_END });
    const handler = onChildConnected({ ManualSyncService: manual });

    await handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId }));
    await deferredWork();

    expect(gate.claim).toHaveBeenCalledWith(CHILD.userId, CHILD.childId, NOW);
    expect(h.client.listCourses).toHaveBeenCalledTimes(1);
    expect(h.state.markSynced.mock.calls[0]?.[0]).toEqual({
      childId: CHILD.childId,
      lease: CHILD.lease,
    });
  });

  for (const outcome of ["throttled", "running"] as const) {
    it(`starts no second sync when the gate answers ${outcome}`, async () => {
      claims({ outcome, retryAt: LATER });
      const handler = onChildConnected({ ManualSyncService: manual });

      await handler.handle(connected({ userId: CHILD.userId, childId: CHILD.childId }));
      await deferredWork();

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

describe("manual refresh of every child", () => {
  it("starts every child it may, skipping blocked ones, and tells when the next refresh is possible", async () => {
    gate.childIdsOf.mockResolvedValue(Result.ok<string[], SyncError>(["c1", "c2", "c3"]));
    gate.claim.mockImplementation(async (_userId, childId) => {
      if (childId === "c1")
        return Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_BLOCKED", message: "école" });
      if (childId === "c2")
        return Result.ok<ManualSyncClaim, SyncError>({ outcome: "throttled", retryAt: LATER });
      return Result.ok<ManualSyncClaim, SyncError>({
        outcome: "started",
        lease: 1,
        label: "Tom",
        retryAt: COOLDOWN_END,
      });
    });

    const result = await manual.requestAll(CHILD.userId);
    await deferredWork();

    expect(result.getValue()).toEqual({ status: "started", retryAt: LATER });
    expect(h.client.listCourses).toHaveBeenCalledTimes(1);
  });

  it("given every child inside its cooldown, then a no-op that tells when the next refresh is possible", async () => {
    gate.childIdsOf.mockResolvedValue(Result.ok<string[], SyncError>(["c1"]));
    claims({ outcome: "running", retryAt: LATER });

    const result = await manual.requestAll(CHILD.userId);

    expect(result.getValue()).toEqual({ status: "throttled", retryAt: LATER });
    expect(h.client.listCourses).not.toHaveBeenCalled();
  });

  it("given a parent without child, then a no-op the parent may retry now", async () => {
    gate.childIdsOf.mockResolvedValue(Result.ok<string[], SyncError>([]));

    const result = await manual.requestAll(CHILD.userId);

    expect(result.getValue()).toEqual({ status: "throttled", retryAt: NOW });
  });
});

describe("manual refresh of one child", () => {
  it("given an idle child, then its sync starts now and the next refresh opens after the cooldown", async () => {
    claims({ outcome: "started", lease: CHILD.lease, label: CHILD.label, retryAt: COOLDOWN_END });

    const result = await manual.requestChild(CHILD.userId, CHILD.childId);
    await deferredWork();

    expect(result.getValue()).toEqual({ status: "started", retryAt: COOLDOWN_END });
    expect(h.client.listCourses).toHaveBeenCalledTimes(1);
  });

  it("given an idle child, then its sync is handed to the background work so it outlives the response", async () => {
    claims({ outcome: "started", lease: CHILD.lease, label: CHILD.label, retryAt: COOLDOWN_END });

    await manual.requestChild(CHILD.userId, CHILD.childId);

    expect(background.defer).toHaveBeenCalledTimes(1);
    await deferredWork();
    expect(h.state.markSynced).toHaveBeenCalledTimes(1);
  });

  it("given a refresh inside the cooldown, then a no-op that tells when the next refresh is possible", async () => {
    claims({ outcome: "throttled", retryAt: LATER });

    const result = await manual.requestChild(CHILD.userId, CHILD.childId);

    expect(result.getValue()).toEqual({ status: "throttled", retryAt: LATER });
    expect(h.client.listCourses).not.toHaveBeenCalled();
  });

  it("given a child of another family, then not found", async () => {
    gate.claim.mockResolvedValue(
      Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_CHILD_NOT_FOUND", message: "absent" }),
    );

    const result = await manual.requestChild(CHILD.userId, "child-of-another-family");

    expect(result.getError().code).toBe("SYNC_CHILD_NOT_FOUND");
  });

  it("refuses a manual sync of a blocked child with the reason", async () => {
    gate.claim.mockResolvedValue(
      Result.fail<ManualSyncClaim, SyncError>({ code: "SYNC_BLOCKED", message: "école" }),
    );

    const result = await manual.requestChild(CHILD.userId, CHILD.childId);

    expect(result.getError()).toEqual({ code: "SYNC_BLOCKED", message: "école" });
  });
});
