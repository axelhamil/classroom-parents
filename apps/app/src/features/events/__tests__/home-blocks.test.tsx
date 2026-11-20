// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { givenCalendar } from "../../../__tests__/calendar-fixtures";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, HUGO } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

const THURSDAY_MORNING = "2026-11-12T09:00:00.000Z";

function block(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("Accueil blocks keep to what they have to say", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    localStorage.clear();
  });

  it("given nothing late, the block says so at its size, and lists the late deadlines once there are some", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const overdue = await screen.findByText("Rien en retard");
    expect(overdue.closest("[data-slot=dashboard-empty]")).not.toBeNull();
    expect(overdue.closest("[data-block=overdue]")?.getAttribute("data-size")).toBe("m");
    cleanup();
    resetApp();

    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    const late = await within(block("En retard")).findByText("Cahier de liaison à signer");
    expect(late.closest("[data-slot=dashboard-empty]")).toBeNull();
    expect(late.closest("[data-block=overdue]")?.getAttribute("data-size")).toBe("m");
  });

  it("given nothing late, the block keeps its place and size while the home is arranged", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    await screen.findByText("Rien en retard");
    const placed = () => {
      const tile = document.querySelector<HTMLElement>("[data-block=overdue]");

      return ["--x", "--y", "--w", "--h"].map((line) => tile?.style.getPropertyValue(line));
    };
    const reading = placed();

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'accueil" }));

    expect(screen.getByRole("group", { name: "Disposition de En retard" })).toBeDefined();
    expect(placed()).toEqual(reading);
  });

  it("given more late deadlines than the block shows at once, it lists them all in a region that scrolls", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [1, 2, 3, 4].map((n) => deadline(n, "2026-11-10", `Devoir oublié ${n}`)),
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

    expect(await within(block("En retard")).findByText("Cahier de liaison à signer")).toBeDefined();
    expect(within(block("Agenda")).queryByRole("button", { name: /^En retard/ })).toBeNull();
  });

  it("lists each coming assessment with its child, its day written once and its revision steps", async () => {
    at(THURSDAY_MORNING);
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

    const assessments = block("Contrôles à réviser");
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
          { id: "assessments", w: 4, h: 2, hidden: false },
          { id: `child:${CHILD.id}`, w: 4, h: 2, hidden: false },
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
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer"),
        deadline(2, "2026-10-20", "Fiche de lecture oubliée"),
      ],
      {
        homeLayout: [
          { id: "overdue", w: 4, h: 2, hidden: false },
          { id: "calendar", w: 8, h: 3, hidden: false },
        ],
      },
    );
    await renderAppAt("/");

    const overdue = block("En retard");
    expect(await within(overdue).findByText("Et 1 plus ancienne, dans l'historique")).toBeDefined();
    expect(
      within(overdue).getAllByRole("link", { name: "Cahier de liaison à signer" }),
    ).toHaveLength(1);
    cleanup();
    resetApp();

    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-10", "Cahier de liaison à signer"),
        deadline(2, "2026-10-20", "Fiche de lecture oubliée"),
      ],
      { homeLayout: [{ id: "calendar", w: 8, h: 3, hidden: false }] },
    );
    await renderAppAt("/");

    expect(await screen.findByRole("button", { name: "En retard, 1 échéance" })).toBeDefined();
  });
});
