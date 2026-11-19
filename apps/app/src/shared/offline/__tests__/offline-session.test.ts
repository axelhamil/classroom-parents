import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionOrOffline } from "../offline-session";

const device = vi.hoisted(() => new Map<string, unknown>());

vi.mock("../offline-store", () => ({
  offlineStorageAvailable: () => true,
  readOffline: async (key: string) => device.get(key),
  writeOffline: async (key: string, value: unknown) => void device.set(key, value),
  removeOffline: async (key: string) => void device.delete(key),
  removeOfflineWhere: async () => undefined,
  clearOffline: async () => device.clear(),
}));
vi.mock("../../observability/sentry", () => ({ captureError: vi.fn() }));

const DAY_MS = 24 * 60 * 60_000;

function sessionOf(expiresInMs: number, pendingDeletionUntil: string | null = null) {
  return {
    user: { id: "parent-a", pendingDeletionUntil },
    session: {
      id: "s1",
      token: "secret-token",
      expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
    },
  };
}

const unreachable = () => Promise.reject(new TypeError("Failed to fetch"));

function settled() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("session when the network is gone", () => {
  beforeEach(() => device.clear());

  it("given a signed-in launch, then the session is kept on the device without its token", async () => {
    const session = sessionOf(DAY_MS);

    await sessionOrOffline(async () => ({ data: session, error: null }), vi.fn());
    await settled();

    expect(device.get("session")).toMatchObject({
      user: { id: "parent-a" },
      session: { id: "s1", token: "" },
    });
  });

  it("given a kept session, when the server cannot be reached, then the parent stays signed in and a recheck is planned", async () => {
    await sessionOrOffline(async () => ({ data: sessionOf(DAY_MS), error: null }), vi.fn());
    await settled();
    const recheck = vi.fn();

    const reply = await sessionOrOffline(unreachable, recheck);

    expect(reply.data?.user.id).toBe("parent-a");
    expect(recheck).toHaveBeenCalledOnce();
  });

  it("given a kept session that has expired, when the server cannot be reached, then the failure stands", async () => {
    await sessionOrOffline(async () => ({ data: sessionOf(-1), error: null }), vi.fn());
    await settled();

    await expect(sessionOrOffline(unreachable, vi.fn())).rejects.toThrow("Failed to fetch");
  });

  it("given the server says signed out, then every offline copy of this device is wiped", async () => {
    device.set("queries:parent-a", "{}");
    device.set("session", sessionOf(DAY_MS));

    await sessionOrOffline(async () => ({ data: null, error: { status: 401 } }), vi.fn());
    await settled();

    expect(device.size).toBe(0);
  });

  it("given the account awaits deletion, then the agenda is no longer kept offline", async () => {
    device.set("queries:parent-a", "{}");
    const leaving = sessionOf(DAY_MS, new Date(Date.now() + 7 * DAY_MS).toISOString());

    await sessionOrOffline(async () => ({ data: leaving, error: null }), vi.fn());
    await settled();

    expect(device.size).toBe(0);
  });

  it("given a server error, then the kept session is left as it is", async () => {
    device.set("session", sessionOf(DAY_MS));

    await sessionOrOffline(async () => ({ data: null, error: { status: 500 } }), vi.fn());
    await settled();

    expect(device.has("session")).toBe(true);
  });
});
