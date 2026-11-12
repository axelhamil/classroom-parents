import { beforeEach, describe, expect, it } from "bun:test";
import { Option } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import type { IOutboxRepository } from "@packages/outbox/outbox.port";
import { enqueuedEvents } from "@packages/outbox/testing/enqueued-events";
import type { PortMock } from "@packages/test/bun";
import type { IChildRepository } from "../application/ports/child-repository.port";
import type { ChildSyncService } from "../application/services/child-sync.service";
import type { ChildAccount } from "../domain/child-account.aggregate";
import {
  ChildStatus,
  type ChildStatusValue,
  type ReconnectCause,
} from "../domain/value-objects/child-status.vo";
import { child, childrenHarness, NOW, ok, PARENT } from "./children-harness";

let repo: PortMock<IChildRepository>;
let outbox: PortMock<IOutboxRepository>;
let sync: ChildSyncService;

beforeEach(() => {
  ({ repo, outbox, sync } = childrenHarness());
});

describe("markNeedsReconnect", () => {
  it.each<[ReconnectCause, ChildStatusValue]>([
    ["invalid_grant", "needs_reconnect"],
    ["school_blocked", "blocked_by_school"],
  ])("given cause %s, then status %s", async (cause, status) => {
    const owned = child();
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    const result = await sync.markNeedsReconnect(owned.id.value, cause);

    expect(result.isSuccess).toBe(true);
    expect(owned.get("status").value).toBe(status);
    expect(enqueuedEvents(outbox)[0]?.payload).toMatchObject({ cause });
  });

  it("given a child syncing when it breaks, then it no longer shows as syncing", async () => {
    const owned = child({ syncStartedAt: NOW, nextSyncAt: new Date(NOW.getTime() + 600_000) });
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    await sync.markNeedsReconnect(owned.id.value, "school_blocked");

    expect(owned.get("syncStartedAt").isNone()).toBe(true);
  });

  it("given a child already in that state, then nothing is written nor emitted", async () => {
    const owned = child({ status: ChildStatus.brokenBy("school_blocked") });
    repo.findForSystem.mockResolvedValue(ok(Option.some(owned)));

    await sync.markNeedsReconnect(owned.id.value, "school_blocked");

    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });
});

const COOLDOWN_MS = 5 * 60_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe("claimManualSync", () => {
  it("given an idle connected child, then started with a new lease and the child shows as syncing", async () => {
    const owned = child({ lastSyncRequestedAt: at(-COOLDOWN_MS - 1_000) });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await sync.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({
      outcome: "started",
      lease: { childId: owned.id.value, lease: 5 },
      label: "Léa",
      retryAt: at(COOLDOWN_MS),
    });
    expect(owned.get("syncStartedAt").unwrap()).toEqual(NOW);
    expect(repo.save).toHaveBeenCalledWith(owned);
  });

  it("given a started manual sync, then the parent's request is recorded with the parent as actor", async () => {
    const owned = child();
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    await sync.claimManualSync(PARENT, owned.id.value, NOW);

    expect(enqueuedEvents(outbox)).toEqual([
      expect.objectContaining({
        eventType: EventTypes.CHILD_SYNC_REQUESTED,
        aggregateId: owned.id.value,
        payload: { userId: PARENT, childId: owned.id.value, actorUserId: PARENT },
      }),
    ]);
  });

  it("given a sync holding an active lease, then running and no second sync starts", async () => {
    const owned = child({
      syncStartedAt: new Date(NOW.getTime() - 5_000),
      nextSyncAt: new Date(NOW.getTime() + 595_000),
    });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await sync.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({ outcome: "running", retryAt: NOW });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("given a refresh requested 4 min ago, then a no-op that tells when the next one is possible", async () => {
    const owned = child({ lastSyncRequestedAt: at(-4 * 60_000) });
    repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

    const result = await sync.claimManualSync(PARENT, owned.id.value, NOW);

    expect(result.getValue()).toEqual({ outcome: "throttled", retryAt: at(60_000) });
    expect(repo.save).not.toHaveBeenCalled();
    expect(enqueuedEvents(outbox)).toEqual([]);
  });

  it.each<ReconnectCause>(["invalid_grant", "school_blocked"])(
    "given a child broken by %s, then CHILD_SYNC_BLOCKED and nothing starts",
    async (cause) => {
      const owned = child({ status: ChildStatus.brokenBy(cause) });
      repo.findOwned.mockResolvedValue(ok(Option.some(owned)));

      const result = await sync.claimManualSync(PARENT, owned.id.value, NOW);

      expect(result.getError().code).toBe("CHILD_SYNC_BLOCKED");
      expect(owned.get("syncStartedAt").isNone()).toBe(true);
      expect(repo.save).not.toHaveBeenCalled();
    },
  );
});

describe("isOwnedBy", () => {
  it("given the parent's connected child, then owned, read under the parent's id", async () => {
    const owned = child();
    repo.findOwnedShared.mockResolvedValue(ok(Option.some(owned)));

    const result = await sync.isOwnedBy(PARENT, owned.id.value);

    expect(result.getValue()).toBe(true);
    expect(repo.findOwnedShared).toHaveBeenCalledWith(PARENT, owned.id.value);
  });

  it("given a child of another family, then not owned", async () => {
    repo.findOwnedShared.mockResolvedValue(ok(Option.none<ChildAccount>()));

    const result = await sync.isOwnedBy("parent-2", "child-of-parent-1");

    expect(result.getValue()).toBe(false);
  });

  it("given a child being disconnected, then not owned any more", async () => {
    const leaving = child({ status: ChildStatus.disconnecting() });
    repo.findOwnedShared.mockResolvedValue(ok(Option.some(leaving)));

    const result = await sync.isOwnedBy(PARENT, leaving.id.value);

    expect(result.getValue()).toBe(false);
  });
});
