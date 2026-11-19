import type { AuditedPage } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { expect, test } from "./csp";
import { AUTHENTICATED_PAGES, FULL_WIDTH_PAGES, PUBLIC_PAGES } from "./pages";
import { STORAGE_STATE } from "./playwright.config";

const DESKTOP = { width: 1440, height: 900 };
const MAX_EMPTY_SHARE = 0.25;

function fullWidth(pages: readonly AuditedPage[]): AuditedPage[] {
  return pages.filter((target) => FULL_WIDTH_PAGES.has(target.name));
}

async function emptyShare(page: Page): Promise<number> {
  return page.locator("main").evaluate((main) => {
    const style = getComputedStyle(main);
    const content =
      main.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);

    return 1 - content / window.innerWidth;
  });
}

async function expectFillsTheScreen(page: Page, target: AuditedPage): Promise<void> {
  await target.prepare?.(page);
  await page.goto(target.path);
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator("main")).toHaveCount(1);

  // Polled: a page swapped in after the first paint (the signed-in 404 inside the shell)
  // detaches the first <main> mid-measure.
  await expect.poll(() => emptyShare(page)).toBeLessThanOrEqual(MAX_EMPTY_SHARE);
}

// A page of cards or lists declared `full` must use the screen: a max width slipped back in
// leaves a column of cards in the middle of a 1440px screen, which no rule engine reports.
test.describe("full width pages at 1440px", () => {
  test.use({ viewport: DESKTOP });

  for (const target of fullWidth(PUBLIC_PAGES)) {
    test(target.name, ({ page }) => expectFillsTheScreen(page, target));
  }

  test.describe("signed in", () => {
    test.use({ storageState: STORAGE_STATE });

    for (const target of fullWidth(AUTHENTICATED_PAGES)) {
      test(target.name, ({ page }) => expectFillsTheScreen(page, target));
    }
  });
});
