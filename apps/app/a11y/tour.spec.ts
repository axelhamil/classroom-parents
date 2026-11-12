import { blockingViolations } from "@packages/test/a11y";
import { expect, type Page, test } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { EVENTS, LEA, REVIEW_EVENT, serveFamily } from "./events-fixtures";
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

const SIDE_OFFSET = 12;

async function offsetDrift(page: Page): Promise<number> {
  const gap = await page.evaluate((selector) => {
    const popover = document.querySelector(selector)?.getBoundingClientRect();
    const target = document.querySelector("[data-tour-active]")?.getBoundingClientRect();
    if (!popover || !target) return null;

    if (popover.right <= target.left) return target.left - popover.right;
    if (popover.left >= target.right) return popover.left - target.right;
    return popover.top >= target.bottom ? popover.top - target.bottom : target.top - popover.bottom;
  }, TOUR_SELECTOR);

  return gap === null ? Number.POSITIVE_INFINITY : Math.abs(gap - SIDE_OFFSET);
}

async function controlsOverflow(page: Page): Promise<number> {
  return page.locator(TOUR_SELECTOR).evaluate((popover) => {
    const box = popover.getBoundingClientRect();
    return [...popover.querySelectorAll("button")].filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.left < box.left || rect.right > box.right;
    }).length;
  });
}

async function settledDrift(page: Page): Promise<number> {
  await page.evaluate(
    (selector) =>
      new Promise<void>((resolve) => {
        let last = "";
        let still = 0;
        const sample = () => {
          const rects = [selector, "[data-tour-active]"].map((query) => {
            const rect = document.querySelector(query)?.getBoundingClientRect();
            return rect ? [rect.top, rect.left] : null;
          });
          const next = JSON.stringify(rects);
          still = next === last ? still + 1 : 0;
          last = next;
          if (still >= 10) resolve();
          else requestAnimationFrame(sample);
        };
        sample();
      }),
    TOUR_SELECTOR,
  );

  return offsetDrift(page);
}

test.describe("guided tour inside the event overlay", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`stays next to its target while the dialog scrolls at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await forgetTours(page);
      await serveFamily(page, { children: [LEA], events: EVENTS });
      await page.goto(`/?event=${REVIEW_EVENT.id}`);

      await expect(page.locator(TOUR_SELECTOR)).toBeVisible();
      await expect.poll(() => offsetDrift(page)).toBeLessThanOrEqual(2);

      await page.locator("[data-tour-active]").evaluate((target) => {
        let scroller = target.parentElement;
        while (scroller && scroller.scrollHeight <= scroller.clientHeight)
          scroller = scroller.parentElement;
        scroller?.scrollBy(0, 200);
      });

      await expect.poll(() => offsetDrift(page)).toBeLessThanOrEqual(2);
    });
  }

  for (const [width, height] of [
    [390, 844],
    [390, 664],
    [375, 548],
    [844, 390],
  ] as const) {
    test(`never covers a tall target at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await forgetTours(page);
      await serveFamily(page, { children: [LEA], events: EVENTS });
      await page.goto(`/?event=${REVIEW_EVENT.id}`);

      const tour = page.locator(TOUR_SELECTOR);
      for (const step of [2, 3, 4]) {
        await tour.getByRole("button", { name: "Suivant" }).click();
        await expect(tour.getByText(`Étape ${step} sur 4`)).toBeVisible();

        await expect.poll(() => settledDrift(page)).toBeLessThanOrEqual(2);
        await expect(tour.getByRole("button", { name: /Suivant|C'est parti/ })).toBeInViewport();
        expect(await controlsOverflow(page)).toBe(0);
      }
    });
  }
});
