import { MutationObserver, onlineManager, QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const device = vi.hoisted(() => new Map<string, unknown>());
interface DoneTick {
  eventId: string;
  done: boolean;
}

const sendTick = vi.hoisted(() => vi.fn(async (_tick: DoneTick) => ({})));

vi.mock("../offline-store", () => ({
  offlineStorageAvailable: () => true,
  readOffline: async (key: string) => device.get(key),
  writeOffline: async (key: string, value: unknown) => void device.set(key, value),
  removeOffline: async (key: string) => void device.delete(key),
  removeOfflineWhere: async (match: (key: string) => boolean) => {
    for (const key of [...device.keys()]) if (match(key)) device.delete(key);
  },
  clearOffline: async () => device.clear(),
}));
vi.mock("../../observability/sentry", () => ({ captureError: vi.fn() }));
vi.mock("../../api/mutations/mark-event-done", () => ({
  markEventDoneMutationOptions: {
    mutationKey: ["events", "done"],
    scope: { id: "events-done" },
    mutationFn: sendTick,
  },
}));

const WEEK_KEY = ["events", "calendar", "2026-11-16", "2026-11-22"];
const LEA_EVENTS = [{ id: "e1", title: "Piscine", deadlineDate: "2026-11-19", done: false }];

const launched: Array<() => Promise<void>> = [];

async function launchApp() {
  vi.resetModules();
  const persistence = await import("../query-persistence");
  launched.push(persistence.forgetOfflineData);

  return { queryClient: new QueryClient(), ...persistence };
}

async function keptOnDevice(key: string, content: string) {
  await vi.waitFor(() => expect(String(device.get(key))).toContain(content), { timeout: 3000 });
}

describe("offline agenda", () => {
  beforeEach(() => {
    device.clear();
    sendTick.mockClear();
    onlineManager.setOnline(true);
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    await Promise.all(launched.splice(0).map((forget) => forget()));
  });

  it("given a parent read their week, when the app is opened again without network, then the week is back", async () => {
    const first = await launchApp();
    await first.keepQueriesOffline(first.queryClient, "parent-a");
    first.queryClient.setQueryData(WEEK_KEY, LEA_EVENTS);
    await keptOnDevice("queries:parent-a", "Piscine");

    const next = await launchApp();
    await next.keepQueriesOffline(next.queryClient, "parent-a");

    expect(next.queryClient.getQueryData(WEEK_KEY)).toEqual(LEA_EVENTS);
  });

  it("given a kept agenda, when the app is opened with network, then it is shown at once but asked again from the server", async () => {
    const first = await launchApp();
    await first.keepQueriesOffline(first.queryClient, "parent-a");
    first.queryClient.setQueryData(WEEK_KEY, LEA_EVENTS);
    await keptOnDevice("queries:parent-a", "Piscine");

    const next = await launchApp();
    await next.keepQueriesOffline(next.queryClient, "parent-a");

    expect(next.queryClient.getQueryState(WEEK_KEY)?.isInvalidated).toBe(true);
  });

  it("given the Google accounts waiting to be linked were read, then they are never kept, since a sign-in round trip changes them", async () => {
    const app = await launchApp();
    await app.keepQueriesOffline(app.queryClient, "parent-a");
    app.queryClient.setQueryData(["children"], [{ id: "c1", label: "Léa" }]);
    app.queryClient.setQueryData(["children", "linkable"], [{ email: "lea@eleve.example" }]);
    await keptOnDevice("queries:parent-a", "Léa");

    expect(String(device.get("queries:parent-a"))).not.toContain("lea@eleve.example");
  });

  it("given another parent signs in on the same phone, then the first parent's agenda is erased and never shown", async () => {
    const first = await launchApp();
    await first.keepQueriesOffline(first.queryClient, "parent-a");
    first.queryClient.setQueryData(WEEK_KEY, LEA_EVENTS);
    await keptOnDevice("queries:parent-a", "Piscine");

    const next = await launchApp();
    await next.keepQueriesOffline(next.queryClient, "parent-b");

    expect(device.has("queries:parent-a")).toBe(false);
    expect(next.queryClient.getQueryData(WEEK_KEY)).toBeUndefined();
  });

  it("given the parent signs out, then nothing of their agenda stays on the device", async () => {
    const app = await launchApp();
    await app.keepQueriesOffline(app.queryClient, "parent-a");
    app.queryClient.setQueryData(WEEK_KEY, LEA_EVENTS);
    await keptOnDevice("queries:parent-a", "Piscine");

    await app.forgetOfflineData();
    app.queryClient.setQueryData(WEEK_KEY, []);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    expect(device.size).toBe(0);
  });

  it("given a deadline ticked done offline and the app closed, when it is opened online, then the tick is sent", async () => {
    const first = await launchApp();
    await first.keepQueriesOffline(first.queryClient, "parent-a");
    onlineManager.setOnline(false);
    void new MutationObserver<unknown, Error, DoneTick>(first.queryClient, {
      mutationKey: ["events", "done"],
    })
      .mutate({ eventId: "e1", done: true })
      .catch(() => undefined);
    await keptOnDevice("queries:parent-a", '"isPaused":true');
    expect(sendTick).not.toHaveBeenCalled();

    onlineManager.setOnline(true);
    const next = await launchApp();
    await next.keepQueriesOffline(next.queryClient, "parent-a");

    await vi.waitFor(() =>
      expect(sendTick).toHaveBeenCalledWith({ eventId: "e1", done: true }, expect.anything()),
    );
  });
});
