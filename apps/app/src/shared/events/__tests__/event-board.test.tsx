// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { EVENT_BASE } from "../../../__tests__/event-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light", setTheme: () => undefined }),
}));

function upcomingEvent(index: number) {
  return {
    ...EVENT_BASE,
    id: `0f6b6a2c-3c1d-4f0e-9a43-${String(index).padStart(12, "0")}`,
    title: `Échéance ${index}`,
    description: "",
    category: "homework",
    deadlineDate: "2099-06-01",
    deadlineAt: "2099-06-01T21:59:00.000Z",
  };
}

const ROW_HEIGHT = 128;

function givenEvents(items: unknown[]): void {
  stubApi(({ method, url }) => {
    if (url.pathname === "/children") return json([CHILD]);
    if (url.pathname === "/events" && method === "GET")
      return json({ items: url.searchParams.get("status") ? [] : items });
    if (url.pathname === "/sync") return json({ status: "requested" }, 202);
    return undefined;
  });
}

describe("event board", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.restoreAllMocks();
  });

  it("event-board shows explicit empty state with its action when 0 events", async () => {
    givenEvents([]);
    await renderAppAt("/");

    const action = await screen.findByRole("link", { name: "Voir mes enfants" });

    expect(screen.getByText("Rien à préparer").closest("[data-slot=empty]")).not.toBeNull();
    expect(action.closest("[data-slot=empty]")).not.toBeNull();
    expect(action.getAttribute("href")).toBe("/children");
  });

  it("event-board keeps virtualization above 50 events (1 000 events render < 60 rows)", async () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(ROW_HEIGHT);
    givenEvents(Array.from({ length: 1000 }, (_, index) => upcomingEvent(index)));
    await renderAppAt("/");

    await screen.findAllByText(/Échéance \d+/);
    await waitFor(() => {
      const rows = within(screen.getByRole("main")).getAllByRole("listitem").length;
      expect(rows).toBeGreaterThan(0);
      expect(rows).toBeLessThan(60);
    });
  });

  it("given no past deadline, the history board points back to upcoming deadlines", async () => {
    givenEvents([]);
    await renderAppAt("/history");

    const action = await screen.findByRole("link", { name: "Voir les échéances à venir" });

    expect(action.closest("[data-slot=empty]")).not.toBeNull();
    expect(action.getAttribute("href")).toBe("/");
  });
});
