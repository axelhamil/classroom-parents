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
  controlled: boolean;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function loadWorker(windows: FakeClient[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(
    async (_title: string, _options?: NotificationOptions) => undefined,
  );
  const openWindow = vi.fn(async () => undefined);
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    clients: {
      matchAll: vi.fn(async (options?: { includeUncontrolled?: boolean }) =>
        windows.filter(({ controlled }) => controlled || options?.includeUncontrolled === true),
      ),
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

interface ClientOptions {
  controlled?: boolean;
  answers?: boolean;
}

function client(
  url: string,
  { controlled = true, answers = true }: ClientOptions = {},
): FakeClient {
  const self: FakeClient = {
    url,
    controlled,
    focus: vi.fn(async () => self),
    navigate: vi.fn(async () => self),
    postMessage: vi.fn((_message: unknown, ports: MessagePort[]) => {
      if (answers) ports[0]?.postMessage("navigated");
    }),
  };
  return self;
}

const NAVIGATE = { type: "keepupkids:navigate", path: "/events/e1" };

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

  it("given a push tagged with its event, then it replaces the earlier notification of that event and rings again", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: {
        json: () => ({
          notification: { title: "t", body: "b", navigate: "/events/e1", tag: "event-e1" },
        }),
      },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ tag: "event-e1", renotify: true }),
    );
  });

  it("given a push without a tag, then it is shown on its own without asking to ring again", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: { json: () => ({ notification: { title: "t", body: "b", navigate: "/" } }) },
    });

    const options = worker.showNotification.mock.calls[0]?.[1];
    expect(options).not.toHaveProperty("tag");
    expect(options).not.toHaveProperty("renotify");
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
      "KeepUpKids",
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

  it.each([["/\\evil.example"], ["/\t/evil.example"]])(
    "given the disguised external target %j, then both the push and the click stay in the app",
    async (navigate) => {
      const worker = loadWorker([]);

      await worker.dispatch("push", {
        data: { json: () => ({ notification: { title: "t", body: "b", navigate } }) },
      });
      await worker.dispatch("notificationclick", {
        notification: { data: { navigate }, close: vi.fn() },
      });

      expect(worker.showNotification).toHaveBeenCalledWith(
        "t",
        expect.objectContaining({ data: { navigate: "/" } }),
      );
      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    },
  );

  it("given a push, then its status bar badge is the monochrome glyph, not the colour icon", async () => {
    const worker = loadWorker();

    await worker.dispatch("push", {
      data: { json: () => ({ notification: { title: "t", body: "b", navigate: "/" } }) },
    });

    expect(worker.showNotification).toHaveBeenCalledWith(
      "t",
      expect.objectContaining({ badge: "/icons/badge-96.png" }),
    );
  });

  it("given an open app window, when the notification is clicked, then that window is focused and its router moves to the target without a reload", async () => {
    const open = client(`${ORIGIN}/history`);
    const worker = loadWorker([open]);
    const close = vi.fn();

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close },
    });

    expect(close).toHaveBeenCalled();
    expect(open.focus).toHaveBeenCalled();
    expect(open.postMessage).toHaveBeenCalledWith(NAVIGATE, [expect.anything()]);
    expect(open.navigate).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("given a window the worker does not control, when the notification is clicked, then that window is reused instead of opening a second one", async () => {
    const uncontrolled = client(`${ORIGIN}/history`, { controlled: false });
    uncontrolled.navigate.mockRejectedValue(new TypeError("client is not controlled"));
    const worker = loadWorker([uncontrolled]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(uncontrolled.focus).toHaveBeenCalled();
    expect(uncontrolled.postMessage).toHaveBeenCalledWith(NAVIGATE, [expect.anything()]);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("given a controlled and an uncontrolled window, when the notification is clicked, then the controlled one is used", async () => {
    const uncontrolled = client(`${ORIGIN}/history`, { controlled: false });
    const controlled = client(`${ORIGIN}/children`);
    const worker = loadWorker([uncontrolled, controlled]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(controlled.focus).toHaveBeenCalled();
    expect(uncontrolled.focus).not.toHaveBeenCalled();
  });

  it("given a window whose app does not answer, when the notification is clicked, then the worker navigates it itself", async () => {
    const silent = client(`${ORIGIN}/history`, { answers: false });
    const worker = loadWorker([silent]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(silent.navigate).toHaveBeenCalledWith(`${ORIGIN}/events/e1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("given an uncontrolled window whose app does not answer, when the notification is clicked, then the target opens in a new window", async () => {
    const silent = client(`${ORIGIN}/history`, { controlled: false, answers: false });
    silent.navigate.mockRejectedValue(new TypeError("client is not controlled"));
    const worker = loadWorker([silent]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/events/e1`);
  });

  it("given no open window, when the notification is clicked, then it opens the target", async () => {
    const worker = loadWorker([]);

    await worker.dispatch("notificationclick", {
      notification: { data: { navigate: "/events/e1" }, close: vi.fn() },
    });

    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/events/e1`);
  });
});
