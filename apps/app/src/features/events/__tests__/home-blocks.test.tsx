// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { givenWideScreen } from "../../../__tests__/match-media";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";

const LATE = /^En retard/;

function block(name: string | RegExp): Promise<HTMLElement> {
  return screen.findByRole("region", { name });
}

describe("Accueil blocks keep to what they have to say", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("given nothing late, the advised block says so at a glance, and on a phone lists on two rows once a deadline is late", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const overdue = await within(await block(LATE)).findByText("Rien en retard, bravo");
    expect(
      within(await block(LATE)).getByText("Un devoir resté non coché après sa date arrivera ici."),
    ).toBeDefined();
    expect(overdue.closest("[data-slot=dashboard-panel-empty]")).not.toBeNull();
    expect(overdue.closest("[data-block=overdue]")?.getAttribute("data-size")).toBe("1x1");
    cleanup();
    resetApp();
    localStorage.clear();

    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    const late = await within(await block(LATE)).findByText("Cahier de liaison à signer");
    expect(late.closest("[data-slot=dashboard-panel-empty]")).toBeNull();
    expect(late.closest("[data-block=overdue]")?.getAttribute("data-size")).toBe("1x2");
  });

  it("given nothing late, the advised glance keeps its size while the home is arranged", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    await screen.findByText("Rien en retard, bravo");
    fireEvent.click(screen.getByRole("button", { name: "Modifier l'accueil" }));

    expect(screen.getByRole("group", { name: "Disposition de En retard" })).toBeDefined();
    const sizes = [...document.querySelectorAll<HTMLElement>("[data-block=overdue][data-size]")];
    expect(sizes.map((tile) => tile.dataset.size)).toEqual(["1x1"]);
  });

  it("given more late deadlines than the block shows at once, it lists them all in a region that scrolls", async () => {
    at(THURSDAY_MORNING);
    givenWideScreen();
    givenCalendar(
      [CHILD],
      [1, 2, 3, 4].map((n) => deadline(n, "2026-11-10", `Devoir oublié ${n}`)),
      { homeLayout: [{ id: "overdue", w: 2, h: 1 }] },
    );
    await renderAppAt("/");

    const list = await screen.findByRole("group", { name: "En retard" });
    expect(await within(list).findAllByRole("link")).toHaveLength(4);
    expect(list.tabIndex).toBe(0);
    const tile = list.closest<HTMLElement>("[data-block=overdue]");
    if (!tile) throw new Error("the list is outside the En retard tile");
    expect(within(tile).queryByRole("button", { name: /^Voir / })).toBeNull();
  });

  it("while the block En retard is on the home, the Agenda drops its own line of late deadlines", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    expect(await within(await block(LATE)).findByText("Cahier de liaison à signer")).toBeDefined();
    expect(within(await block("Agenda")).queryByRole("button", { name: /^En retard/ })).toBeNull();
  });

  it("lists each coming assessment with its child, its day written once and its revision steps", async () => {
    at(THURSDAY_MORNING);
    givenWideScreen();
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-16", "Contrôle de conjugaison", { category: "assessment" }),
        deadline(2, "2026-11-13", "Interrogation de géographie", {
          category: "assessment",
          childId: HUGO.id,
        }),
      ],
    );
    await renderAppAt("/");

    const assessments = await block("Contrôles à réviser");
    const links = await within(assessments).findAllByRole("link");
    const [hugo, lea] = links.map((link) => link.closest("li"));
    expect(hugo?.textContent).toContain("Interrogation de géographie");
    expect(within(hugo ?? assessments).getByText("Demain")).toBeDefined();
    expect(within(hugo ?? assessments).getByText("Hugo")).toBeDefined();
    expect(lea?.textContent).toContain("Contrôle de conjugaison");
    expect(within(lea ?? assessments).getByText("Lundi 16 novembre")).toBeDefined();
    expect(lea?.textContent).not.toMatch(/Dans \d+ jours/);
    const steps = within(assessments).getAllByRole("checkbox", { name: "Réviser la veille" });
    expect(steps).toHaveLength(2);
    expect(steps[0]?.closest("a, button:not([role=checkbox])")).toBeNull();
  });

  it("marks a date to check on every line that shows it (6)", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-12", "Lecture du chapitre 4", { status: "needs_review" })],
    );
    await renderAppAt("/");

    const today = await screen.findByRole("region", { name: "Pour aujourd'hui" });
    const row = (await within(today).findByRole("link", { name: "Lecture du chapitre 4" })).closest(
      "li",
    );
    expect(within(row ?? today).getByText("À vérifier")).toBeDefined();
  });

  it("writes the time of a deadline once, beside the word that says it is tonight (8)", async () => {
    at(THURSDAY_MORNING);
    givenWideScreen();
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Quiz en ligne", {
          category: "assessment",
          deadlineTime: "18:00",
        }),
      ],
    );
    await renderAppAt("/");

    const rowIn = async (name: string) => {
      const region = await screen.findByRole("region", { name });
      const link = await within(region).findByRole("link", { name: "Quiz en ligne" });

      return link.closest("li") ?? region;
    };
    const briefed = await rowIn("Pour aujourd'hui");
    const listed = await rowIn("Contrôles à réviser");
    expect(briefed.textContent?.match(/18 h/g)).toHaveLength(1);
    expect(listed.textContent?.match(/18 h/g)).toHaveLength(1);
    expect(within(listed).getByText("Ce soir")).toBeDefined();
    expect(within(listed).queryByText("Aujourd'hui")).toBeNull();
  });

  it("gives a deadline the same day label in every block that lists it (7)", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [deadline(1, "2026-11-16", "Contrôle de conjugaison", { category: "assessment" })],
      {
        homeLayout: [
          { id: "assessments", w: 2, h: 1 },
          { id: `child:${CHILD.id}`, w: 2, h: 1 },
        ],
      },
    );
    await renderAppAt("/");

    const whenIn = async (name: string) => {
      const region = await screen.findByRole("region", { name });
      const link = await within(region).findByRole("link", { name: "Contrôle de conjugaison" });

      return within(link.closest("li") ?? region).getByText(/novembre/).textContent;
    };
    expect(await whenIn("Contrôles à réviser")).toBe("Lundi 16 novembre");
    expect(await whenIn(CHILD.label)).toBe("Lundi 16 novembre");
  });

  it("keeps a deadline late for more than two weeks in sight, and the calendar counts late ones like the block (5)", async () => {
    at(THURSDAY_MORNING);
    givenWideScreen();
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer"),
        deadline(2, "2026-10-20", "Fiche de lecture oubliée"),
      ],
      {
        homeLayout: [
          { id: "overdue", w: 2, h: 1 },
          { id: "calendar", w: 2, h: 2 },
        ],
      },
    );
    await renderAppAt("/");

    const overdue = await block(LATE);
    expect(await within(overdue).findByText("Et 1 plus ancienne, dans l'historique")).toBeDefined();
    expect(
      within(overdue).getAllByRole("link", { name: "Cahier de liaison à signer" }),
    ).toHaveLength(1);
    cleanup();
    resetApp();
    localStorage.clear();

    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer"),
        deadline(2, "2026-10-20", "Fiche de lecture oubliée"),
      ],
      { homeLayout: [{ id: "calendar", w: 2, h: 2 }] },
    );
    await renderAppAt("/");

    expect(await screen.findByRole("button", { name: "En retard, 1 échéance" })).toBeDefined();
  });
});

const TILE_SIZES = [
  { content: "glance", w: 1, h: 1 },
  { content: "few", w: 2, h: 1 },
  { content: "full", w: 2, h: 2 },
] as const;

const SIZED_BLOCKS = [
  {
    id: "overdue",
    name: LATE,
    events: [1, 2, 3].map((n) => deadline(n, "2026-11-10", `Devoir oublié ${n}`)),
  },
  {
    id: "documents",
    name: "À signer, à rendre",
    events: [16, 17, 18].map((day, n) =>
      deadline(n, `2026-11-${day}`, `Autorisation ${n}`, { category: "document_due" }),
    ),
  },
  {
    id: "tonight",
    name: "Pour ce soir",
    events: [1, 2, 3].map((n) => deadline(n, "2026-11-13", `Exercices ${n}`)),
  },
  {
    id: "review",
    name: "À vérifier",
    events: [19, 23, 25].map((day, n) =>
      deadline(n, `2026-11-${day}`, `Date douteuse ${n}`, { status: "needs_review" }),
    ),
  },
] as const;

describe("each block writes its content for the room its tile has", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  for (const sized of SIZED_BLOCKS)
    for (const { content, w, h } of TILE_SIZES)
      it(`given ${sized.id} on ${w} x ${h} cases, it shows ${content === "glance" ? "a glance without rows" : "its rows"}`, async () => {
        at(THURSDAY_MORNING);
        givenWideScreen();
        givenCalendar([CHILD], [...sized.events], { homeLayout: [{ id: sized.id, w, h }] });
        await renderAppAt("/");

        const region = await block(sized.name);
        const shown = () =>
          content === "glance"
            ? region.querySelector("[data-slot=dashboard-panel-figure]")
            : within(region).queryAllByRole("listitem")[0];
        await waitFor(() => expect(shown()).toBeTruthy());

        expect(region.closest<HTMLElement>("[data-block]")?.dataset.content).toBe(content);
        expect(within(region).queryAllByRole("listitem").length > 0).toBe(content !== "glance");
        expect(region.querySelectorAll("[data-slot=scroll-region]").length).toBeLessThanOrEqual(1);
      });
});

const PHONE_ROWS = [
  { id: `child:${CHILD.id}`, name: CHILD.label },
  { id: "workload", name: "Charge de la semaine" },
] as const;

describe("on a phone, a block saved one row high keeps its surface on two rows", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  for (const saved of PHONE_ROWS)
    it(`given ${saved.id} saved 2 x 1, it is drawn 1 x 2, a few rows rather than a glance`, async () => {
      at(THURSDAY_MORNING);
      givenCalendar(
        [CHILD],
        [deadline(1, "2026-11-13", "Exercices de grammaire"), deadline(2, "2026-11-16", "Poésie")],
        { homeLayout: [{ id: saved.id, w: 2, h: 1 }] },
      );
      await renderAppAt("/");

      const region = await block(saved.name);
      const tile = region.closest<HTMLElement>("[data-block]");

      await waitFor(() => expect(tile?.dataset.content).toBe("few"));
      expect(tile?.dataset.size).toBe("2x1");
    });
});
