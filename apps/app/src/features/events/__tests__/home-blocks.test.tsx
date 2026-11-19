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

  it("given nothing late, the block folds into one line, and opens up once a deadline is late", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const overdue = await screen.findByText("Rien en retard");
    expect(overdue.closest("[data-slot=dashboard-panel]")?.getAttribute("data-shape")).toBe("line");
    cleanup();
    resetApp();

    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    const late = await within(block("En retard")).findByText("Cahier de liaison à signer");
    expect(late.closest("[data-slot=dashboard-panel]")?.getAttribute("data-shape")).toBe("box");
  });

  it("given nothing late, the block keeps its cell of the grid, the one it has while the home is arranged", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], []);
    await renderAppAt("/");

    const line = (await screen.findByText("Rien en retard")).closest("[data-block=overdue]");
    expect(line?.closest("[data-slot=dashboard]")).not.toBeNull();
    expect(line?.getAttribute("data-h")).toBe("1");
    expect(line?.getAttribute("data-w")).toBe("4");

    fireEvent.click(screen.getByRole("button", { name: "Modifier l'accueil" }));

    const tile = document.querySelector("[data-block=overdue]");
    expect(tile?.closest("[data-slot=dashboard]")).not.toBeNull();
    expect(tile?.getAttribute("data-w")).toBe("4");
  });

  it("given more late deadlines than the block holds, it shows the first ones and a button for the others", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [1, 2, 3, 4].map((n) => deadline(n, "2026-11-10", `Devoir oublié ${n}`)),
    );
    await renderAppAt("/");

    const overdue = block("En retard");
    expect(await within(overdue).findAllByRole("link")).toHaveLength(2);
    fireEvent.click(within(overdue).getByRole("button", { name: "Voir les 2 autres" }));
    expect(within(overdue).getAllByRole("link")).toHaveLength(4);
  });

  it("while the block En retard is on the home, the Agenda drops its own line of late deadlines", async () => {
    at(THURSDAY_MORNING);
    givenCalendar([CHILD], [deadline(1, "2026-11-10", "Cahier de liaison à signer")]);
    await renderAppAt("/");

    expect(await within(block("En retard")).findByText("Cahier de liaison à signer")).toBeDefined();
    expect(within(block("Agenda")).queryByRole("button", { name: /^En retard/ })).toBeNull();
  });

  it("lists each coming assessment with its child, the days left and its revision steps", async () => {
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
    expect(await within(assessments).findByText("Léa, dans 4 jours")).toBeDefined();
    expect(within(assessments).getByText("Hugo, demain")).toBeDefined();
    const steps = within(assessments).getAllByRole("checkbox", { name: "Réviser la veille" });
    expect(steps).toHaveLength(2);
    expect(steps[0]?.closest("a, button:not([role=checkbox])")).toBeNull();
  });
});
