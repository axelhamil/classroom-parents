import type { Page } from "@playwright/test";
import { expect, test } from "./csp";
import { EVENTS, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const CONTENT_BUDGET_MS = 300;

declare global {
  interface Window {
    __pseudoAnimations: Set<string>;
  }
}

async function openHome(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
  await page.goto("/");
}

function weekRow(page: Page) {
  return page
    .locator("[data-slot=calendar-day]")
    .getByRole("link", { name: new RegExp(REVIEW_EVENT.title.slice(0, 30)) });
}

function longestMovingAnimationMs(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      0,
      ...document.getAnimations().map((animation) => {
        const { duration, delay } = animation.effect?.getComputedTiming() ?? {};
        return (typeof duration === "number" ? duration : 0) + (delay ?? 0);
      }),
    ),
  );
}

function collectPseudoAnimations(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.__pseudoAnimations = new Set();
    const collect = () => {
      for (const animation of document.getAnimations()) {
        const effect = animation.effect;
        if (effect instanceof KeyframeEffect && effect.pseudoElement)
          window.__pseudoAnimations.add(effect.pseudoElement);
      }
      requestAnimationFrame(collect);
    };
    requestAnimationFrame(collect);
  });
}

test.describe("motion of the deadline overlay", () => {
  test.use({ storageState: STORAGE_STATE });

  test("the phone drawer holds focus while it rises and gives it back once it has sunk", async ({
    page,
  }) => {
    await openHome(page, 390);
    const row = weekRow(page);
    await row.focus();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog");
    await expect
      .poll(() => drawer.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(row).toBeFocused();
    await expect(page).toHaveURL((url) => !url.searchParams.has("event"));
  });

  test("the content of the sheet lands within 300 ms of its opening", async ({ page }) => {
    await openHome(page, 1440);
    await weekRow(page).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const landsBy = await sheet.evaluate((element) =>
      Math.max(
        ...Array.from(
          element.querySelectorAll("[data-slot=sheet-header], [data-slot=sheet-body] > *"),
          (block) => {
            const style = getComputedStyle(block);
            const delay = Number.parseFloat(style.animationDelay);
            const duration = Number.parseFloat(style.animationDuration);
            return (delay + duration) * 1000;
          },
        ),
      ),
    );

    expect(landsBy).toBeGreaterThan(0);
    expect(landsBy).toBeLessThanOrEqual(CONTENT_BUDGET_MS);
  });

  test("the date of the row opened becomes the heading of its sheet", async ({ page }) => {
    await openHome(page, 1440);
    await collectPseudoAnimations(page);
    await weekRow(page).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => [...window.__pseudoAnimations]))
      .toContain("::view-transition-group(deadline-date)");
  });

  test("under reduced motion a deadline opens and closes without moving", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page, 390);
    const row = weekRow(page);
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    expect(await longestMovingAnimationMs(page)).toBeLessThanOrEqual(1);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(row).toBeFocused();
  });
});
