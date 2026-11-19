// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byRoute, json, renderAppAt, resetApp, stubApi } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const ARRANGED = [
  { id: "notes", size: "m" },
  { id: "today", size: "m" },
];

const WIDENED = [{ id: "today", size: "l" }];

function givenHome(blocks: unknown) {
  return stubApi(
    byRoute({
      "GET /children": () => json([CHILD]),
      "POST /sync": () => json({ status: "requested" }, 202),
      "GET /events": () => json({ items: [] }),
      "GET /events/calendar": () => json({ items: [] }),
      "GET /home/layout": () => json({ blocks, revision: 0 }),
      "PUT /home/layout": () => json({ blocks: WIDENED, revision: 1 }),
      "GET /home/note": () => json({ body: "", updatedAt: null }),
    }),
  );
}

function shownBlocks(): (string | undefined)[] {
  return [...document.querySelectorAll<HTMLElement>("[data-slot=dashboard-tile]")].map(
    (tile) => tile.dataset.block,
  );
}

describe("Accueil is arranged by the parent and follows them", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("given a home arranged on another device, then its blocks come in that order and size", async () => {
    givenHome(ARRANGED);
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));
    expect(document.querySelector("[data-block=today]")?.getAttribute("data-w")).toBe("4");
  });

  it("when one block is widened and another hidden, one save leaves with the whole layout", async () => {
    const calls = givenHome(ARRANGED);
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'accueil" }));
    fireEvent.click(await screen.findByRole("button", { name: "Élargir Pour aujourd'hui" }));
    fireEvent.click(screen.getByRole("button", { name: "Masquer Pense-bête" }));

    expect(shownBlocks()).toEqual(["today"]);
    expect(screen.getByRole("button", { name: "Ajouter un bloc" })).toBe(document.activeElement);
    const saves = () =>
      calls.filter((call) => call.method === "PUT" && call.url.pathname === "/home/layout");
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]?.body).toEqual({ blocks: WIDENED, baseRevision: 0 });
  });
});
