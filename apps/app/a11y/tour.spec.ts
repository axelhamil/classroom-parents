import { blockingViolations } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { EVENTS, LEA, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";
import { forgetTours, TOUR_SELECTOR } from "./tour";

test.describe("first-run guided tour on Accueil", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`is a labelled popover with no blocking violation (${colorScheme})`, async ({ page }) => {
      await showColorScheme(page, colorScheme);
      await forgetTours(page);
      await serveFamily(page, { children: [LEA], events: EVENTS });
      await page.goto("/");

      const tour = page.locator(TOUR_SELECTOR);
      await expect(tour).toBeVisible();
      await expect(tour).toHaveRole("dialog");
      await expect(tour).toHaveAccessibleName(/\S/);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("takes focus, never traps it, closes on Escape and stays closed", async ({ page }) => {
    await forgetTours(page);
    await serveFamily(page, { children: [LEA], events: EVENTS });
    await page.goto("/");

    const tour = page.locator(TOUR_SELECTOR);
    const next = tour.getByRole("button", { name: "Suivant" });
    await expect(next).toBeFocused();

    const firstTitle = await tour.getAttribute("aria-labelledby");
    await next.press("Enter");
    await expect(tour.getByRole("button", { name: "Précédent" })).toBeVisible();
    await expect(tour).toHaveAttribute("aria-labelledby", firstTitle ?? "");

    await page.keyboard.press("Tab");
    expect(await tour.evaluate((popover) => popover.contains(document.activeElement))).toBe(false);
    await expect(tour).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(tour).toBeHidden();

    await page.reload();
    await expect(page.locator("main")).toBeVisible();
    await expect(tour).toBeHidden();
  });
});
