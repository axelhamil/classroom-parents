// @vitest-environment jsdom
import { act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import { givenPushBrowser, VAPID_PUBLIC_KEY } from "../../../__tests__/push-browser";
import { queryClient } from "../../../shared/api/query-client";
import {
  base64UrlToBytes,
  rememberPushOwner,
  storedPushOwner,
} from "../../../shared/pwa/push-support";
import { type PushSubscriptionState, usePushSubscription } from "../hooks/use-push-subscription";

let latest: PushSubscriptionState | undefined;

function Probe(): ReactNode {
  latest = usePushSubscription("user-1");
  return null;
}

async function renderPushHook() {
  await renderWithProviders(<Probe />);

  return {
    current: () => {
      if (!latest) throw new Error("hook not rendered");
      return latest;
    },
  };
}

describe("usePushSubscription", () => {
  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("given a parent who was never asked, when they enable alerts and accept, then the browser subscribes with the VAPID key and the subscription is posted once", async () => {
    const browser = givenPushBrowser({ permission: "default", answer: "granted" });
    const calls = stubApi(
      byRoute({
        "GET /push/config": () => json({ vapidPublicKey: VAPID_PUBLIC_KEY }),
        "POST /push/subscriptions": () => new Response(null, { status: 204 }),
        "GET /push/status": () => json({ live: 1 }),
      }),
    );
    const hook = await renderPushHook();

    await act(() => hook.current().enable());

    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
    });
    expect(
      calls
        .filter((call) => call.method === "POST")
        .map(({ method, url, body }) => ({ method, path: url.pathname, body })),
    ).toEqual([
      {
        method: "POST",
        path: "/push/subscriptions",
        body: {
          endpoint: "https://fcm.googleapis.com/fcm/send/new",
          keys: { p256dh: "p256dh-key", auth: "auth-key" },
        },
      },
    ]);
    await waitFor(() => expect(hook.current().subscribed).toBe(true));
    expect(hook.current().permission).toBe("granted");
    expect(storedPushOwner()).toEqual({
      userId: "user-1",
      endpoint: "https://fcm.googleapis.com/fcm/send/new",
    });
  });

  it("given a parent who refuses the browser prompt, when they enable alerts, then nothing is subscribed nor posted and the refusal is shown", async () => {
    const browser = givenPushBrowser({ permission: "default", answer: "denied" });
    const calls = stubApi(byRoute({}));
    const hook = await renderPushHook();

    await act(() => hook.current().enable());

    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    await waitFor(() => expect(hook.current().permission).toBe("denied"));
    expect(hook.current().subscribed).toBe(false);
  });

  it("given a browser already subscribed, when the parent disables alerts, then the endpoint is deleted on the server and the browser unsubscribes", async () => {
    const existing = {
      endpoint: "https://fcm.googleapis.com/fcm/send/old",
      toJSON: () => ({ endpoint: "", keys: { p256dh: "", auth: "" } }),
      unsubscribe: vi.fn(async () => true),
    };
    givenPushBrowser({ permission: "granted", existing });
    rememberPushOwner({ userId: "user-1", endpoint: existing.endpoint });
    const calls = stubApi(
      byRoute({
        "DELETE /push/subscriptions": () => new Response(null, { status: 204 }),
        "GET /push/status": () => json({ live: 0 }),
      }),
    );
    const hook = await renderPushHook();
    await waitFor(() => expect(hook.current().subscribed).toBe(true));

    await act(() => hook.current().disable());

    expect(calls.find((call) => call.method === "DELETE")?.body).toEqual({
      endpoint: existing.endpoint,
    });
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
    expect(hook.current().subscribed).toBe(false);
    expect(storedPushOwner()).toBeUndefined();
  });
});
