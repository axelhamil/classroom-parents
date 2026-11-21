import type { AuditedPage } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { expect, test } from "./csp";
import { LEA, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { AUTHENTICATED_PAGES, PUBLIC_PAGES, RUNNING_TEXT_PAGES, WIDTH_GATE_EXEMPT } from "./pages";
import { paintedEmptyShare, paintedRects } from "./painted";
import { STORAGE_STATE } from "./playwright.config";

const SCREENS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];
const MAX_EMPTY_SHARE = 0.25;

async function serveReviewEvent(page: Page): Promise<void> {
  await serveFamily(page, { children: [LEA], events: [REVIEW_EVENT] });
}

const DEADLINE_PAGES: readonly AuditedPage[] = [
  { name: "deadline", path: `/events/${REVIEW_EVENT.id}`, prepare: serveReviewEvent },
  { name: "edit a deadline", path: `/events/${REVIEW_EVENT.id}/edit`, prepare: serveReviewEvent },
];

function gated(pages: readonly AuditedPage[]): AuditedPage[] {
  return pages.filter((target) => !WIDTH_GATE_EXEMPT.has(target.name));
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

async function paintedShare(page: Page): Promise<number> {
  const width = page.viewportSize()?.width ?? 0;

  return paintedEmptyShare(await paintedRects(page.locator("main")), width);
}

async function cappedCards(page: Page): Promise<number> {
  return page
    .locator("main [data-slot=card]")
    .evaluateAll(
      (cards) => cards.filter((card) => getComputedStyle(card).maxWidth !== "none").length,
    );
}

async function expectFillsTheScreen(page: Page, target: AuditedPage): Promise<void> {
  await target.prepare?.(page);
  await page.goto(target.path);
  await expect(page).toHaveURL(new RegExp(`${target.path.replace("?", "\\?")}$`));
  await expect(page.locator("main")).toHaveCount(1);

  // Polled: a page swapped in after the first paint (the signed-in 404 inside the shell)
  // detaches the first <main> mid-measure.
  await expect.poll(() => emptyShare(page)).toBeLessThanOrEqual(MAX_EMPTY_SHARE);
  if (!RUNNING_TEXT_PAGES.has(target.name)) {
    await expect.poll(() => paintedShare(page)).toBeLessThanOrEqual(MAX_EMPTY_SHARE);
  }
  expect(await cappedCards(page)).toBe(0);
}

// The page takes the screen, its content the page and its cards their column: a max width
// slipped back in, on the page or on a block inside it, leaves a column in the middle of a
// computer screen, which no rule engine reports. Measured on what is painted, since a full
// width <main> around a narrow column still spans the screen.
for (const screen of SCREENS) {
  test.describe(`every page fills a ${screen.width}px screen`, () => {
    test.use({ viewport: screen });

    for (const target of gated(PUBLIC_PAGES)) {
      test(target.name, ({ page }) => expectFillsTheScreen(page, target));
    }

    test.describe("signed in", () => {
      test.use({ storageState: STORAGE_STATE });

      for (const target of [...gated(AUTHENTICATED_PAGES), ...DEADLINE_PAGES]) {
        test(target.name, ({ page }) => expectFillsTheScreen(page, target));
      }
    });
  });
}
