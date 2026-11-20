import { blockingViolations } from "@packages/test/a11y";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { STORAGE_STATE } from "./playwright.config";

test.describe("settings on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`shows the alerts and the account sections without overflow (${colorScheme})`, async ({
      page,
    }) => {
      await showColorScheme(page, colorScheme);
      await page.goto("/settings");

      await expect(
        page.getByRole("heading", { name: "Notifications sur ce téléphone" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Supprimer mon compte" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Heures calmes" })).toBeVisible();
      await expect(page.getByLabel("Début")).toHaveValue("21:00");
      await expect(page.getByRole("combobox", { name: "Pays de l'école" })).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("asks before signing out and keeps the session when the parent cancels", async ({
    page,
  }) => {
    await page.goto("/settings");

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Se déconnecter de ce téléphone ?" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Annuler" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

// A section is one block: a column opening in the middle of a section leaves its cards under
// the previous section's title. Each section's title and cards share one column, or the
// section spans the whole row.
test.describe("settings sections", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const width of [390, 768, 1280, 1440, 1920]) {
    test(`keep their title and cards together at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/settings");
      await expect(page.locator("[data-slot=page-section]")).toHaveCount(5);

      const split = await page.locator("[data-slot=card-columns]").evaluate((grid) => {
        const row = grid.getBoundingClientRect().width;

        return [...grid.querySelectorAll<HTMLElement>("[data-slot=page-section]")]
          .filter((section) => {
            const lefts = new Set(
              [...section.children].map((part) => Math.round(part.getBoundingClientRect().left)),
            );
            const spansRow = section.getBoundingClientRect().width >= row - 1;

            return lefts.size > 1 && !spansRow;
          })
          .map((section) => section.id);
      });

      expect(split).toEqual([]);
    });
  }
});
