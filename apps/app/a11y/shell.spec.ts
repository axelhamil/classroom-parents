import { blockingViolations } from "@packages/test/a11y";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";

test.describe("login on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`has one main, one h1 and no blocking violation (${colorScheme})`, async ({ page }) => {
      await showColorScheme(page, colorScheme);
      await page.goto("/login");

      await expect(page).toHaveURL(/\/login$/);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }
});
