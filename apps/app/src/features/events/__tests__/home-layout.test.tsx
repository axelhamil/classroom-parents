// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const NOTE_HIDDEN = [{ id: "today", size: "m" }];

function givenHome(blocks: unknown) {
  return stubApi(
    byRoute({
      "GET /children": () => json([CHILD]),
      "POST /sync": () => json({ status: "requested" }, 202),
      "GET /events": () => json({ items: [] }),
      "GET /events/calendar": () => json({ items: [] }),
      "GET /home/layout": () => json({ blocks, revision: 0 }),
      "PUT /home/layout": () => json({ blocks: NOTE_HIDDEN, revision: 1 }),
      "GET /home/note": () => json({ body: "", updatedAt: null }),
    }),
  );
}

function shownBlocks(): (string | undefined)[] {
  return [...document.querySelectorAll<HTMLElement>("[data-block][data-size]")].map(
    (tile) => tile.dataset.block,
  );
}

async function openMenu(trigger: HTMLElement) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  await userEvent.click(trigger);
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
    expect(document.querySelector("[data-block=today]")?.getAttribute("data-size")).toBe("m");
  });

  it("given nothing arranged yet, then the home follows the advised layout", async () => {
    givenHome(null);
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()[0]).toBe("today"));
    expect(shownBlocks()).toContain("calendar");
    expect(document.querySelector("[data-block=today]")?.getAttribute("data-size")).toBe("l");
  });

  it("when a block is hidden, the layout left is saved against the revision it was made on", async () => {
    const calls = givenHome(ARRANGED);
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'accueil" }));
    await act(() => import("../../../shared/dashboard/edit/home-edit-grid"));
    await openMenu(await screen.findByRole("button", { name: "Disposition de Pense-bête" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Masquer Pense-bête" }));

    await waitFor(() => expect(shownBlocks()).toEqual(["today"]));
    expect(screen.getByRole("button", { name: "Ajouter un bloc" })).toBe(document.activeElement);
    const saves = () =>
      calls.filter((call) => call.method === "PUT" && call.url.pathname === "/home/layout");
    await waitFor(() => expect(saves()).toHaveLength(1));
    expect(saves()[0]?.body).toEqual({ blocks: NOTE_HIDDEN, baseRevision: 0 });
  });
});
