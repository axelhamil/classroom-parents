// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import {
  ANDROID_CHROME,
  fakeSubscription,
  givenNoPushBrowser,
  givenPushBrowser,
  givenUserAgent,
} from "../../../__tests__/push-browser";
import { rememberPushOwner, storedPushOwner } from "../../../shared/pwa/push-support";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

const HERE = "https://fcm.googleapis.com/fcm/send/here";

describe("AccountCard", () => {
  afterEach(() => {
    resetApp();
    localStorage.clear();
    givenNoPushBrowser();
    vi.restoreAllMocks();
  });

  it("given this phone receives the parent's alerts, when they sign out, then the subscription is deleted on the server and in the browser before the session ends", async () => {
    givenUserAgent(ANDROID_CHROME, false);
    const subscription = fakeSubscription(HERE);
    givenPushBrowser({ permission: "granted", existing: subscription });
    rememberPushOwner({ userId: "user-1", endpoint: HERE });
    const calls = stubApi(
      byRoute({
        "GET /push/status": () => json({ live: 1 }),
        "DELETE /push/subscriptions": () => new Response(null, { status: 204 }),
        "POST /api/auth/sign-out": () => json({ success: true }),
      }),
    );
    const appRouter = await renderAppAt("/settings");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Se déconnecter" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Se déconnecter" }));

    await waitFor(() => expect(appRouter.state.location.pathname).toBe("/login"));
    const writes = calls.filter(
      ({ method, url }) =>
        method !== "GET" &&
        (url.pathname.startsWith("/push/") || url.pathname === "/api/auth/sign-out"),
    );
    expect(writes.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      "DELETE /push/subscriptions",
      "POST /api/auth/sign-out",
    ]);
    expect(writes[0]?.body).toEqual({ endpoint: HERE });
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(storedPushOwner()).toBeUndefined();
  });
});
