// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAppAt, resetApp } from "../../../__tests__/app-harness";
import { CHILD } from "../../../__tests__/family-fixtures";
import { at, deadline, givenFamily, HUGO } from "../../../__tests__/week-fixtures";

vi.mock("@packages/web-kit/theme/use-theme", () => ({
  useTheme: () => ({
    theme: "system",
    resolvedTheme: "light",
    changeTheme: () => Promise.resolve(),
  }),
}));

function columnOf(child: string): HTMLElement {
  return screen.getByRole("region", { name: child });
}

describe("Planning du frigo, the printable week", () => {
  afterEach(() => {
    cleanup();
    resetApp();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("print week lists every child's deadlines of the week with a checkbox each", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily(
      [CHILD, HUGO],
      [
        deadline(1, "2026-11-13", "Piscine du vendredi", { category: "swimming" }),
        deadline(2, "2026-11-14", "Dictée des animaux", { childId: HUGO.id }),
        deadline(3, "2026-11-15", "Exposé sur les volcans"),
        deadline(4, "2026-11-18", "Contrôle de grammaire", { category: "assessment" }),
      ],
    );
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 12 au 15 novembre" }),
    ).toBeDefined();
    await screen.findByRole("region", { name: "Hugo" });
    const lea = within(columnOf("Léa")).getAllByRole("listitem");
    const hugo = within(columnOf("Hugo")).getAllByRole("listitem");

    expect(lea.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Piscine du vendredi"),
      expect.stringContaining("Exposé sur les volcans"),
    ]);
    expect(hugo.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Dictée des animaux"),
    ]);
    for (const item of [...lea, ...hugo]) {
      expect(item.querySelectorAll('[data-slot="print-planner-box"]')).toHaveLength(1);
    }
    expect(screen.queryByText("Contrôle de grammaire")).toBeNull();
  });

  it("empty child shows the friendly line", async () => {
    at("2026-11-12T09:00:00.000Z");
    givenFamily([CHILD, HUGO], [deadline(1, "2026-11-13", "Piscine du vendredi")]);
    await renderAppAt("/week/print");

    await screen.findByRole("region", { name: "Hugo" });

    expect(within(columnOf("Hugo")).queryAllByRole("listitem")).toHaveLength(0);
    expect(
      within(columnOf("Hugo")).getByText("Rien de prévu cette semaine, profitez-en."),
    ).toBeDefined();
    expect(
      within(columnOf("Léa")).queryByText("Rien de prévu cette semaine, profitez-en."),
    ).toBeNull();
  });

  it("default week is next week from Friday evening", async () => {
    at("2026-11-13T17:00:00.000Z");
    givenFamily(
      [CHILD],
      [
        deadline(1, "2026-11-14", "Exposé sur les volcans"),
        deadline(2, "2026-11-18", "Contrôle de grammaire", { category: "assessment" }),
      ],
    );
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 16 au 22 novembre" }),
    ).toBeDefined();
    expect(await screen.findByText("Contrôle de grammaire")).toBeDefined();
    expect(screen.queryByText("Exposé sur les volcans")).toBeNull();

    cleanup();
    resetApp();
    at("2026-11-13T09:00:00.000Z");
    givenFamily([CHILD], []);
    await renderAppAt("/week/print");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Semaine du 13 au 15 novembre" }),
    ).toBeDefined();
  });
});
