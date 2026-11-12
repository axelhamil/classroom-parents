import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { expect, type Page, test } from "@playwright/test";
import { EVENTS, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

async function expectOnePageWithoutOverflow(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test.describe("upcoming events on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`two children, a blocked one and an event to review (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
      await page.goto("/");

      await expect(page.getByRole("heading", { level: 2, name: "À vérifier" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Voir les enfants" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: new RegExp(REVIEW_EVENT.title.slice(0, 30)) }),
      ).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });

    test(`first sync still running (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await serveFamily(page, {
        children: [{ ...LEA, lastSyncedAt: undefined, syncing: true }],
        events: [],
      });
      await page.goto("/");

      await expect(page.getByText(/analyse en cours/)).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("a category chip filters through the url and the request", async ({ page }) => {
    const requests = await serveFamily(page, { children: [LEA], events: EVENTS });
    await page.goto("/?tab=upcoming");

    const swimming = page.getByRole("button", { name: "Piscine" });
    await swimming.click();

    await expect(page).toHaveURL(/[?&]category=swimming/);
    await expect(swimming).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => requests.map((request) => new URL(request.url()).searchParams.get("category")))
      .toContain("swimming");
  });
});

test.describe("event overlay focus", () => {
  test.use({ storageState: STORAGE_STATE });

  test("the sheet gives focus back to the sticker that opened it on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto("/");

    const sticker = page
      .locator("[data-slot=week-day]")
      .getByRole("link", { name: new RegExp(REVIEW_EVENT.title.slice(0, 30)) });
    await sticker.focus();
    await page.keyboard.press("Enter");

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(sticker).toBeFocused();
  });

  test("the drawer takes focus on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?event=${REVIEW_EVENT.id}`);

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => drawer.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
  });
});
