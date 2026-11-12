// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiCall, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "system", resolvedTheme: "light", setTheme: () => undefined }),
}));

function pastEvent(index: number, deadlineDate: string, title: string) {
  return {
    id: `0f6b6a2c-3c1d-4f0e-9a43-${String(index).padStart(12, "0")}`,
    childId: CHILD.id,
    title,
    description: "",
    category: "homework",
    deadlineDate,
    deadlineAt: `${deadlineDate}T22:59:00.000Z`,
    status: "confirmed",
    source: "announcement",
    done: false,
    announcementUrl: "https://classroom.google.com/c/abc/p/def",
    receivedAt: "2026-09-05T10:00:00.000Z",
    edited: false,
    editedFields: [],
  };
}

function givenHistory(items: unknown[]): ApiCall[] {
  return stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json([CHILD]);
    if (url.pathname === "/events" && method === "GET") return json({ items });
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

function historyRequests(calls: ApiCall[]): URLSearchParams[] {
  return calls
    .filter((call) => call.method === "GET" && call.url.pathname === "/events")
    .map((call) => call.url.searchParams);
}

describe("Accueil, tab Passées", () => {
  afterEach(() => {
    cleanup();
    resetApp();
  });

  it("Accueil switches to Passées and shows past deadlines", async () => {
    const calls = givenHistory([
      pastEvent(1, "2026-11-06", "Exposé sur les volcans"),
      pastEvent(2, "2026-10-14", "Sortie au musée"),
    ]);
    await renderAppAt("/");

    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Passées" }));

    const panel = await screen.findByRole("tabpanel", { name: "Passées" });
    await within(panel).findByText("Exposé sur les volcans");
    const list = within(panel).getByRole("list");
    const titles = within(list)
      .getAllByRole("link")
      .map((link) => link.textContent ?? "");

    expect(historyRequests(calls).map((query) => query.get("scope"))).toContain("history");
    expect(titles[0]).toContain("Exposé sur les volcans");
    expect(titles[1]).toContain("Sortie au musée");
  });

  it("given no past event, then the empty history explains what lands here", async () => {
    givenHistory([]);
    await renderAppAt("/?tab=history");

    expect(await screen.findByText("Les échéances passées seront rangées ici.")).toBeDefined();
  });

  it("/history redirects to Accueil tab Passées", async () => {
    givenHistory([pastEvent(1, "2026-11-06", "Exposé sur les volcans")]);
    const router = await renderAppAt("/history");

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({ tab: "history" });
    expect(
      (await screen.findByRole("tab", { name: "Passées" })).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("given 100 past events, then only a window of rows is rendered", async () => {
    givenHistory(
      Array.from({ length: 100 }, (_, index) =>
        pastEvent(index, "2026-10-01", `Échéance passée ${index}`),
      ),
    );
    await renderAppAt("/?tab=history");

    expect((await screen.findAllByText(/Échéance passée/)).length).toBeGreaterThan(0);
    await waitFor(() => {
      const rows = within(screen.getByRole("main")).getAllByRole("listitem").length;
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThan(100);
    });
  });
});
