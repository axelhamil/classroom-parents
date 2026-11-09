import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const SW_SOURCE = readFileSync(
  fileURLToPath(new URL("../../../../public/sw.js", import.meta.url)),
  "utf8",
);
const ORIGIN = "https://app.example.test";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  data?: { json: () => unknown } | null;
  notification?: { data: unknown; close: () => void };
  waitUntil: (promise: Promise<unknown>) => void;
}

interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function loadWorker(windows: FakeClient[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(async () => undefined);
  const openWindow = vi.fn(async () => undefined);
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async () => windows),
      openWindow,
      claim: vi.fn(async () => undefined),
    },
    skipWaiting: vi.fn(async () => undefined),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  new Function("self", SW_SOURCE)(self);

  const dispatch = async (type: string, event: Omit<FakeEvent, "waitUntil">) => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };

  return { dispatch, showNotification, openWindow };
}

function client(url: string): FakeClient {
  const self: FakeClient = {
    url,
    focus: vi.fn(async () => self),
    navigate: vi.fn(async () => self),
  };
  return self;
}

describe("service worker", () => {
  it("given a valid push payload, then it shows the notification with its title, body and target", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: {
        json: () => ({
          notification: {
            title: "Piscine jeudi",
            body: "Sac de piscine pour Léa",
            navigate: "/events/e1",
          },
        }),
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "Piscine jeudi",
      expect.objectContaining({
        body: "Sac de piscine pour Léa",
        data: { navigate: "/events/e1" },
      }),
    );
  });

  it("given a payload that is not JSON, then it still shows a generic French notification", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: {
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "Échéances Classroom",
      expect.objectContaining({
        body: "Une échéance approche. Ouvrez l'application pour la voir.",
        data: { navigate: "/" },
      }),
    );
  });

  it("given a target outside the app, then the notification opens the app home instead", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: {
        json: () => ({ notification: { title: "t", body: "b", navigate: "https://evil.test/x" } }),
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ data: { navigate: "/" } }),
    );
  });

  it("given an open app window, when the notification is clicked, then that window is focused on the target", async () => {
    const open = client(`${ORIGIN}/history`);
    const worker = loadWorker([open]);
    const close = vi.fn();

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close },
    });

    expect(close).toHaveBeenCalled();
    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/events/e1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("given no open window, when the notification is clicked, then it opens the target", async () => {
    const worker = loadWorker([]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/events/e1`);
  });
});
