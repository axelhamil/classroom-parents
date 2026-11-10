import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";
import { inDays, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const PAST_EVENTS = Array.from({ length: 100 }, (_, index) => ({
  ...REVIEW_EVENT,
  id: `9c8b7a6d-5e4f-4a3b-8c2d-${String(index).padStart(12, "0")}`,
  childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
  title: index === 0 ? REVIEW_EVENT.title : `Exercices ${index} page ${index + 100}`,
  status: "confirmed",
  deadlineDate: inDays(-1 - index),
  deadlineAt: `${inDays(-1 - index)}T07:00:00.000Z`,
}));

test.describe("history on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`100 past events, two children (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      const requests = await serveFamily(page, {
        children: [LEA, MAXIMILIEN],
        events: PAST_EVENTS,
      });
      await page.goto("/history");

      await expect(
        page.getByRole("link", { name: new RegExp(REVIEW_EVENT.title.slice(0, 30)) }),
      ).toBeVisible();
      expect(await page.locator("main li").count()).toBeLessThan(PAST_EVENTS.length);
      expect(requests.map((request) => new URL(request.url()).searchParams.get("scope"))).toContain(
        "history",
      );
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(await blockingViolations(page)).toEqual([]);
    });

    test(`empty history (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await serveFamily(page, { children: [LEA], events: [] });
      await page.goto("/history");

      await expect(page.getByText("Les échéances passées seront rangées ici.")).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });
  }
});
