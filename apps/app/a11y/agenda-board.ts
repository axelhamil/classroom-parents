import type { Locator } from "@playwright/test";

/** The cards of a board whose category shows no word beside its icon, or not on the icon's line. */
export function wordlessCategories(board: Locator): Promise<string[]> {
  return board.locator("[data-slot=calendar-entry]").evaluateAll((cards) =>
    cards.flatMap((card) => {
      const category = card.querySelector("[data-slot=deadline-category]");
      const icon = category?.querySelector("svg")?.getBoundingClientRect();
      const word = [...(category?.querySelectorAll("span") ?? [])].find(
        (span) => span.getBoundingClientRect().width > 1 && span.textContent?.trim(),
      );
      const box = word?.getBoundingClientRect();
      const sameLine =
        icon && box && Math.abs(icon.top + icon.height / 2 - (box.top + box.height / 2)) <= 2;

      return sameLine
        ? []
        : [card.querySelector("[data-slot=calendar-entry-link]")?.textContent ?? ""];
    }),
  );
}
