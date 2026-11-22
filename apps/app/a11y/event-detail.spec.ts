import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { LEA, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { gridColumns, largestHole, paintedRects } from "./painted";
import { STORAGE_STATE } from "./playwright.config";

test.describe("event detail on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`sheet, why to verify, five reminders in every state, their editor and actions (${colorScheme})`, async ({
      page,
    }) => {
      await showColorScheme(page, colorScheme);
      await serveFamily(page, { children: [LEA], events: [REVIEW_EVENT] });
      await page.goto(`/events/${REVIEW_EVENT.id}`);

      await expect(page.getByRole("heading", { level: 1 })).toHaveText(REVIEW_EVENT.title);
      await expect(page.getByRole("region", { name: "Pourquoi à vérifier" })).toBeVisible();
      await expect(page.locator("mark")).toHaveText(REVIEW_EVENT.evidence.quote);
      await expect(page.getByText("3 jours avant, à 18 h")).toBeVisible();
      await expect(page.getByText("Non planifié")).toBeVisible();
      await expect(page.getByRole("link", { name: "Ouvrir dans Classroom" })).toHaveAttribute(
        "href",
        REVIEW_EVENT.announcementUrl,
      );
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await blockingViolations(page)).toEqual([]);

      await page.getByRole("button", { name: "Modifier les rappels" }).click();

      await expect(page.getByRole("button", { name: "Ajouter un rappel" })).toBeDisabled();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("the delete confirmation keeps focus and gives it back on Escape", async ({ page }) => {
    await serveFamily(page, { children: [LEA], events: [REVIEW_EVENT] });
    await page.goto(`/events/${REVIEW_EVENT.id}`);

    const trigger = page.getByRole("button", { name: "Supprimer" });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Supprimer cette échéance ?" });
    await expect(dialog).toBeVisible();
    expect(await blockingViolations(page, "[role=alertdialog]")).toEqual([]);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

// A deadline spreads its parts over the width; a part shorter than its row neighbour must not
// leave a hole under it that pushes the next part down the screen.
const MAX_HOLE = 64;

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`event detail on a ${viewport.width}px screen`, () => {
    test.use({ storageState: STORAGE_STATE, viewport });

    test("leaves no hole between its parts", async ({ page }) => {
      await serveFamily(page, { children: [LEA], events: [REVIEW_EVENT] });
      await page.goto(`/events/${REVIEW_EVENT.id}`);
      const why = page.getByRole("region", { name: "Pourquoi à vérifier" });
      await expect(why).toBeVisible();

      // The grid that lays out the deadline's parts, the outermost holding them, whatever other
      // section grid the page or a part draws.
      const parts = page.locator("main [data-slot=section-grid]").filter({ has: why }).first();

      const hole = largestHole(await paintedRects(parts), await gridColumns(parts));

      expect(hole).toBeLessThanOrEqual(MAX_HOLE);
    });
  });
}
