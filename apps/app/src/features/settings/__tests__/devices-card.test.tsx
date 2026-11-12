// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: () => undefined }),
}));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const WINDOWS_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAC_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:133.0) Gecko/20100101 Firefox/133.0";

function session(id: string, token: string, userAgent: string, updatedAt: string) {
  return {
    id,
    token,
    userId: "user-1",
    userAgent,
    ipAddress: null,
    createdAt: "2026-11-01T08:00:00.000Z",
    updatedAt,
    expiresAt: "2026-12-01T08:00:00.000Z",
  };
}

function givenSessions(initial: ReturnType<typeof session>[]) {
  let live = initial;

  return stubApi(
    byRoute({
      "GET /push/status": () => json({ live: 1 }),
      "GET /api/auth/list-sessions": () => json(live),
      "POST /api/auth/revoke-session": ({ body }) => {
        live = live.filter((row) => JSON.stringify({ token: row.token }) !== JSON.stringify(body));
        return json({ status: true });
      },
      "POST /api/auth/revoke-other-sessions": () => {
        live = live.filter((row) => row.token === "token-1");
        return json({ status: true });
      },
    }),
  );
}

function writesTo(calls: ReturnType<typeof stubApi>) {
  return calls
    .filter((call) => call.method === "POST" && call.url.pathname.startsWith("/api/auth/revoke"))
    .map((call) => ({ path: call.url.pathname, body: call.body }));
}

describe("devices card", () => {
  afterEach(() => {
    resetApp();
    vi.restoreAllMocks();
  });

  it("devices card marks this device and revokes another session", async () => {
    const calls = givenSessions([
      session("s-2", "token-2", WINDOWS_CHROME, "2026-11-10T19:30:00.000Z"),
      session("s-1", "token-1", IPHONE, "2026-11-12T08:00:00.000Z"),
    ]);
    await renderAppAt("/settings");

    const card = await screen.findByRole("region", { name: "Appareils connectés" });
    const [current, other, ...rest] = await within(card).findAllByRole("listitem");
    if (!current || !other) throw new Error("the card lists fewer than two devices");
    expect(rest).toHaveLength(0);
    expect(within(current).getByText("Safari sur iPhone ou iPad")).toBeTruthy();
    expect(within(current).getByText("Cet appareil")).toBeTruthy();
    expect(within(current).queryByRole("button")).toBeNull();
    expect(within(other).getByText("Chrome sur Windows")).toBeTruthy();

    await userEvent.setup().click(within(other).getByRole("button", { name: "Déconnecter" }));

    await waitFor(() => expect(within(card).getAllByRole("listitem")).toHaveLength(1));
    expect(writesTo(calls)).toEqual([
      { path: "/api/auth/revoke-session", body: { token: "token-2" } },
    ]);
    expect(
      within(card).queryByRole("button", { name: "Se déconnecter partout ailleurs" }),
    ).toBeNull();
  });

  it("sign out everywhere else asks for confirmation", async () => {
    const calls = givenSessions([
      session("s-1", "token-1", IPHONE, "2026-11-12T08:00:00.000Z"),
      session("s-2", "token-2", WINDOWS_CHROME, "2026-11-10T19:30:00.000Z"),
      session("s-3", "token-3", MAC_FIREFOX, "2026-11-09T07:15:00.000Z"),
    ]);
    await renderAppAt("/settings");
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Se déconnecter partout ailleurs" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Déconnecter les autres appareils ?",
    });
    expect(within(dialog).getByText(/ne recevront plus vos alertes/)).toBeTruthy();
    expect(writesTo(calls)).toEqual([]);

    await user.click(within(dialog).getByRole("button", { name: "Oui, les déconnecter" }));

    const card = screen.getByRole("region", { name: "Appareils connectés" });
    await waitFor(() => expect(within(card).getAllByRole("listitem")).toHaveLength(1));
    expect(writesTo(calls)).toEqual([{ path: "/api/auth/revoke-other-sessions", body: {} }]);
  });

  it("a long list of devices starts with this device once the parent scrolls down to it", async () => {
    const LIST_TOP_ON_A_PHONE = 1373;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
      this: Element,
    ) {
      const top = this.getAttribute("role") === "list" ? LIST_TOP_ON_A_PHONE - window.scrollY : 0;
      return DOMRect.fromRect({ x: 0, y: top, width: 358, height: 72 });
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(72);
    window.scrollY = LIST_TOP_ON_A_PHONE;
    givenSessions([
      session("s-1", "token-1", IPHONE, "2026-11-12T08:00:00.000Z"),
      ...Array.from({ length: 24 }, (_, index) =>
        session(`s-${index + 2}`, `token-${index + 2}`, WINDOWS_CHROME, "2026-11-10T19:30:00.000Z"),
      ),
    ]);
    await renderAppAt("/settings");

    const card = await screen.findByRole("region", { name: "Appareils connectés" });

    expect(await within(card).findByText("Cet appareil")).toBeTruthy();
    window.scrollY = 0;
    vi.unstubAllGlobals();
  });
});
