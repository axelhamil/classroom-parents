// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
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
const THURSDAY_EVENING = "2026-11-12T17:00:00.000Z";

const WITH_TONIGHT = {
  homeLayout: [
    { id: "today", w: 8, h: 2, hidden: false },
    { id: "tonight", w: 4, h: 1, hidden: false },
    { id: "calendar", w: 12, h: 3, hidden: false },
  ],
};

async function tonight(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "Pour ce soir" });
}

function stepsIn(region: HTMLElement): string[] {
  return within(region)
    .queryAllByRole("checkbox")
    .map((box) => document.querySelector(`label[for="${box.id}"]`)?.textContent ?? "");
}

describe("Pour ce soir lists what to do tonight for the next school day", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("given two deadlines tomorrow with steps, it lists their steps, never their cards", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Exercices de grammaire"),
        deadline(2, "2026-11-13", "Évaluation de calcul", { category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    expect(await within(block).findByText("À préparer pour demain")).toBeDefined();
    expect(stepsIn(block)).toEqual(["Vérifier qu'il est fait", "Réviser la veille"]);
    expect(within(block).queryAllByRole("link")).toEqual([]);
    expect(within(block).queryByText(/Rien/)).toBeNull();
  });

  it("given a swimming session and an added item, it lists what goes in the bag", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Piscine", {
          category: "swimming",
          checklist: {
            done: ["prepare.items.swimming.swimsuit"],
            removed: ["prepare.items.swimming.showerGel"],
            extra: [{ id: "atlas", label: "Atlas" }],
          },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("Atlas");
    expect(stepsIn(block)).toEqual(["Maillot de bain", "Bonnet de bain", "Serviette", "Atlas"]);
  });

  it("groups the steps by child", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Exercices", { childId: CHILD.id }),
        deadline(2, "2026-11-13", "Dictée", { childId: HUGO.id, category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    const hugo = await within(block).findByRole("region", { name: "Hugo" });
    expect(stepsIn(hugo)).toEqual(["Réviser la veille"]);
    const first = within(block).getByRole("region", { name: CHILD.label });
    expect(stepsIn(first)).toEqual(["Vérifier qu'il est fait"]);
  });

  it("given deadlines tomorrow already prepared, it says so and counts them", async () => {
    at(THURSDAY_EVENING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-13", "Fiche rendue", { done: true }),
        deadline(2, "2026-11-13", "Exercices", {
          checklist: { done: ["prepare.items.homework.check"], removed: [], extra: [] },
        }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    expect(
      await within(block).findByText("Rien à préparer ce soir, 2 échéances demain"),
    ).toBeDefined();
    expect(stepsIn(block)).toEqual([]);
  });

  it("given nothing due tomorrow, it says nothing is planned", async () => {
    at(THURSDAY_EVENING);
    givenCalendar([CHILD], [deadline(1, "2026-11-17", "Exposé")], WITH_TONIGHT);
    await renderAppAt("/");

    expect(await within(await tonight()).findByText("Rien de prévu demain")).toBeDefined();
  });

  it("during the school day, today's deadlines stay with Pour aujourd'hui", async () => {
    at(THURSDAY_MORNING);
    givenCalendar(
      [CHILD],
      [
        deadline(1, "2026-11-12", "Mot à signer", { category: "document_due" }),
        deadline(2, "2026-11-13", "Évaluation de calcul", { category: "assessment" }),
      ],
      WITH_TONIGHT,
    );
    await renderAppAt("/");

    const block = await tonight();
    await within(block).findByText("À préparer pour demain");
    expect(stepsIn(block)).toEqual(["Réviser la veille"]);
  });
});
