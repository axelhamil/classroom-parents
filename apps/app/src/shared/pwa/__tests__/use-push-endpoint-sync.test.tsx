// @vitest-environment jsdom
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, renderWithProviders, stubApi } from "../../../__tests__/app-harness";
import { fakeSubscription, givenPushBrowser } from "../../../__tests__/push-browser";
import { queryClient } from "../../api/query-client";
import { rememberPushOwner, storedPushOwner } from "../push-support";
import { usePushEndpointSync } from "../use-push-endpoint-sync";

function Probe() {
  usePushEndpointSync(PARENT);
  return null;
}

const ROTATED = "https://fcm.googleapis.com/fcm/send/rotated";
const PARENT = "parent-b";

describe("usePushEndpointSync", () => {
  afterEach(() => {
    queryClient.clear();
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("given the browser rotated its push endpoint, when the app opens, then the new subscription is posted and remembered", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(ROTATED) });
    rememberPushOwner({ userId: PARENT, endpoint: "https://fcm.googleapis.com/fcm/send/before" });
    const calls = stubApi(
      byRoute({
        "POST /push/subscriptions": () => new Response(null, { status: 204 }),
      }),
    );

    await renderWithProviders(<Probe />);

    await waitFor(() => expect(storedPushOwner()).toEqual({ userId: PARENT, endpoint: ROTATED }));
    expect(calls.map(({ method, url, body }) => ({ method, path: url.pathname, body }))).toEqual([
      {
        method: "POST",
        path: "/push/subscriptions",
        body: { endpoint: ROTATED, keys: { p256dh: "p256dh-key", auth: "auth-key" } },
      },
    ]);
  });

  it("given the endpoint already posted, when the app opens, then nothing is posted", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(ROTATED) });
    rememberPushOwner({ userId: PARENT, endpoint: ROTATED });
    const calls = stubApi(byRoute({}));

    await renderWithProviders(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toEqual([]);
  });

  it("given alerts turned off in the browser, when the app opens, then the remembered endpoint is forgotten and nothing is posted", async () => {
    givenPushBrowser({ permission: "granted", existing: null });
    rememberPushOwner({ userId: PARENT, endpoint: ROTATED });
    const calls = stubApi(byRoute({}));

    await renderWithProviders(<Probe />);

    await waitFor(() => expect(storedPushOwner()).toBeUndefined());
    expect(calls).toEqual([]);
  });

  it("given this browser subscribed for another parent, when this parent opens the app, then nothing is posted and the subscription stays the other parent's", async () => {
    givenPushBrowser({ permission: "granted", existing: fakeSubscription(ROTATED) });
    rememberPushOwner({
      userId: "parent-a",
      endpoint: "https://fcm.googleapis.com/fcm/send/before",
    });
    const calls = stubApi(byRoute({}));

    await renderWithProviders(<Probe />);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(calls).toEqual([]);
    expect(storedPushOwner()?.userId).toBe("parent-a");
  });
});
