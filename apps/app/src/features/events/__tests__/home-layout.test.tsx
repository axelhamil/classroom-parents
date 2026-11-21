// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  byRoute,
  json,
  queryClient,
  renderAppAt,
  renderWithProviders,
  resetApp,
  stubApi,
} from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline } from "../../../__tests__/week-fixtures";
import { schoolClock } from "../../../shared/agenda/school-clock";
import type { ChildDto } from "../../../shared/api/queries/children";
import { welcomeBlock } from "../components/blocks/welcome-block";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const ARRANGED = [
  { id: "notes", w: 2, h: 1 },
  { id: "today", w: 2, h: 1 },
];

const NOTE_HIDDEN = [{ id: "today", w: 2, h: 1 }];

const SCHOOL_MORNING = "2026-11-12T08:00:00.000Z";

const READ_CHILD = { ...CHILD, color: 1, status: "connected" } satisfies ChildDto;

const READING_CHILD = { ...READ_CHILD, lastSyncedAt: undefined, syncing: true } satisfies ChildDto;

interface HomeData {
  family: readonly ChildDto[];
  events: readonly unknown[];
}

function givenHome(blocks: unknown, data: HomeData = { family: [READ_CHILD], events: [] }) {
  return stubApi(
    byRoute({
      "GET /children": () => json(data.family),
      "POST /sync": () => json({ status: "requested" }, 202),
      "GET /events": () => json({ items: data.events }),
      "GET /events/calendar": () => json({ items: data.events }),
      "GET /home/layout": () => json({ v: 3, blocks, revision: 0 }),
      "PUT /home/layout": () => json({ v: 3, blocks: NOTE_HIDDEN, revision: 1 }),
      "GET /home/note": () => json({ body: "", updatedAt: null }),
      "GET /push/status": () => json({ live: 0 }),
    }),
  );
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function layoutSaves(calls: ReturnType<typeof givenHome>) {
  return calls.filter((call) => call.method === "PUT" && call.url.pathname === "/home/layout");
}

async function arrangeTheHome() {
  fireEvent.click(await screen.findByRole("button", { name: "Modifier l'accueil" }));
  await act(() => import("../../../shared/dashboard/edit/home-edit-grid"));
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
    vi.useRealTimers();
  });

  it("given a home arranged on another device, then its blocks come in that order and size", async () => {
    givenHome(ARRANGED);
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));
    expect(document.querySelector("[data-block=today]")?.getAttribute("data-size")).toBe("2x1");
  });

  it("given nothing arranged yet on a school morning, then the home follows the layout advised for one column", async () => {
    at("2026-11-12T08:00:00.000Z");
    givenHome(null);
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()[0]).toBe("today"));
    expect(shownBlocks()).toContain("calendar");
    expect(document.querySelector("[data-block=today]")?.getAttribute("data-size")).toBe("1x2");
  });

  it("given nothing arranged yet on a school morning, then the advised hero alone wears the hero look, its large date and its sentence", async () => {
    at("2026-11-12T08:00:00.000Z");
    givenHome(null);
    await renderAppAt("/");

    await waitFor(() => expect(document.querySelectorAll("[data-hero]")).toHaveLength(1));
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    expect(hero?.closest<HTMLElement>("[data-block]")?.dataset.block).toBe("today");
    expect(hero?.querySelector("[data-hero-date]")).not.toBeNull();
    expect(hero?.textContent).toContain("Semaine calme");
    const secondaries = [...document.querySelectorAll("[data-block][data-size]")].filter(
      (tile) => !tile.contains(hero ?? null),
    );
    expect(secondaries.length).toBeGreaterThan(0);
    for (const tile of secondaries) expect(tile.querySelector("[data-hero-date]")).toBeNull();
  });

  it("given a home arranged by the parent, then no block wears the hero look", async () => {
    at("2026-11-12T08:00:00.000Z");
    givenHome(ARRANGED);
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));
    expect(document.querySelectorAll("[data-hero]")).toHaveLength(0);
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
    expect(saves()[0]?.body).toEqual({ v: 3, blocks: NOTE_HIDDEN, baseRevision: 0 });
  });

  it("given a home arranged by the parent, then the drawer never offers the first steps", async () => {
    givenHome(ARRANGED);
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));

    await arrangeTheHome();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un bloc" }));

    const drawer = await screen.findByRole("dialog", { name: "Ajouter un bloc" });
    expect(within(drawer).getByRole("button", { name: "Ajouter Pour ce soir" })).toBeTruthy();
    expect(within(drawer).queryByRole("button", { name: "Ajouter Premiers pas" })).toBeNull();
  });

  it("when the parent goes back to the advised layout and confirms, then the choice is forgotten", async () => {
    const calls = givenHome(ARRANGED);
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()).toEqual(["notes", "today"]));

    await arrangeTheHome();
    fireEvent.click(screen.getByRole("button", { name: "Revenir à la disposition conseillée" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Revenir à la disposition conseillée ?",
    });
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Revenir à la disposition conseillée" }),
    );

    await waitFor(() => expect(layoutSaves(calls)).toHaveLength(1));
    expect(layoutSaves(calls)[0]?.body).toEqual({ v: 3, blocks: null, baseRevision: 0 });
  });

  it("given a new parent whose child is still read, then the first steps lead the home with today's date", async () => {
    at(SCHOOL_MORNING);
    givenHome(null, { family: [READING_CHILD], events: [] });
    await renderAppAt("/");

    await waitFor(() => expect(shownBlocks()[0]).toBe("welcome"));
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    expect(hero?.closest<HTMLElement>("[data-block]")?.dataset.block).toBe("welcome");
    expect(hero?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-12");
  });

  it("given the first steps on the home, when it is arranged, then they stay first with no handle or menu and the other blocks are counted without them", async () => {
    at(SCHOOL_MORNING);
    givenHome(null, { family: [READING_CHILD], events: [] });
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()[0]).toBe("welcome"));
    const read = shownBlocks();

    await arrangeTheHome();

    expect(shownBlocks()).toEqual(read);
    expect(screen.queryByRole("button", { name: "Déplacer Premiers pas" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Disposition de Premiers pas" })).toBeNull();
    const notes = screen.getByRole("button", { name: "Déplacer Pense-bête" });
    fireEvent.keyDown(notes, { key: " " });
    fireEvent.keyDown(notes, { key: "Home" });
    expect(shownBlocks()).toEqual(read);
    expect(
      screen.getByText(`Pense-bête, position 1 sur ${read.length - 1}, largeur 1, hauteur 2`),
    ).toBeTruthy();
  });

  it("given the first steps on the home, when a deadline has arrived by the parent's next return, then they are gone", async () => {
    at(SCHOOL_MORNING);
    const data: HomeData = { family: [READING_CHILD], events: [] };
    givenHome(null, data);
    await renderAppAt("/");
    await waitFor(() => expect(shownBlocks()[0]).toBe("welcome"));

    data.family = [READ_CHILD];
    data.events = [deadline(1, "2026-11-13", "Exercices de grammaire")];
    await act(() => queryClient.invalidateQueries());
    setVisibility("hidden");
    vi.setSystemTime(new Date("2026-11-12T09:01:00.000Z"));
    setVisibility("visible");

    await waitFor(() => expect(shownBlocks()).not.toContain("welcome"));
  });
});

describe("Premiers pas shows where the parent stands in the three first steps", () => {
  const clock = schoolClock(new Date(SCHOOL_MORNING));

  afterEach(() => {
    cleanup();
    resetApp();
  });

  async function givenFirstSteps(family: readonly ChildDto[], live: number) {
    stubApi(byRoute({ "GET /push/status": () => json({ live }) }));
    const { Component } = welcomeBlock;
    const rootRoute = createRootRoute({
      component: () => (
        <Component
          blockId="welcome"
          title="Premiers pas"
          userId="user-1"
          family={family}
          childId={null}
          clock={clock}
          briefingShown={false}
          overdueShown={false}
          advice={null}
        />
      ),
    });
    const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
    await router.load();
    await renderWithProviders(<RouterProvider router={router} />);

    return screen.findByRole("list", { name: "Vos premiers pas" });
  }

  function step(steps: HTMLElement, title: string): HTMLElement {
    const found = within(steps)
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText(title));
    if (!found) throw new Error(`no step ${title}`);

    return found;
  }

  function linkOf(item: HTMLElement): { name: string; href: string | null } | null {
    const link = within(item).queryByRole("link");

    return link ? { name: link.textContent ?? "", href: link.getAttribute("href") } : null;
  }

  it("given no child linked yet, then linking leads to adding a child and the reading waits for it", async () => {
    const steps = await givenFirstSteps([], 0);

    const link = step(steps, "Lier le compte d'un enfant");
    expect(within(link).getByText("À faire")).toBeTruthy();
    expect(linkOf(link)).toEqual({ name: "Lier un enfant", href: "/children/new" });
    const reading = step(steps, "Lire sa classe Classroom");
    expect(within(reading).getByText("Commence une fois un enfant lié")).toBeTruthy();
    expect(linkOf(reading)).toBeNull();
    const reminders = step(steps, "Activer les rappels");
    await waitFor(() => expect(within(reminders).getByText("À faire")).toBeTruthy());
    expect(linkOf(reminders)).toEqual({
      name: "Activer dans les réglages",
      href: "/settings/notifications",
    });
  });

  it("given one of two children still read, then the reading shows how far it went", async () => {
    const steps = await givenFirstSteps([READ_CHILD, { ...READING_CHILD, id: "child-2" }], 0);

    const link = step(steps, "Lier le compte d'un enfant");
    expect(within(link).getByText("Fait")).toBeTruthy();
    expect(linkOf(link)).toBeNull();
    const reading = step(steps, "Lire sa classe Classroom");
    expect(within(reading).getByText("Lecture en cours : 1 sur 2")).toBeTruthy();
    expect(within(reading).getByRole("progressbar")).toBeTruthy();
  });

  it("given a child whose school blocks the reading, then the reading asks to check the children, not to do it", async () => {
    const steps = await givenFirstSteps(
      [{ ...READING_CHILD, status: "blocked_by_school", syncing: false }],
      0,
    );

    const reading = step(steps, "Lire sa classe Classroom");
    expect(within(reading).getByText("À vérifier")).toBeTruthy();
    expect(within(reading).queryByText("À faire")).toBeNull();
    expect(linkOf(reading)).toEqual({ name: "Voir les enfants", href: "/children" });
  });

  it("given a child read and reminders on, then every step is done and none leads elsewhere", async () => {
    const steps = await givenFirstSteps([READ_CHILD], 1);

    await waitFor(() => expect(within(steps).getAllByText("Fait")).toHaveLength(3));
    expect(within(steps).queryAllByRole("link")).toHaveLength(0);
  });
});
