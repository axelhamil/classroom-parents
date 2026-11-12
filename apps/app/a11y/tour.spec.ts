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

async function holdStill(page: Page): Promise<void> {
  await page.evaluate(
    (selector) =>
      new Promise<void>((resolve) => {
        let last = "";
        let still = 0;
        const sample = () => {
          const rects = [selector, "[data-tour-active]"].map((query) => {
            const rect = document.querySelector(query)?.getBoundingClientRect();
            return rect ? [rect.top, rect.left, rect.height] : null;
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
}

async function avoidableCover(page: Page): Promise<number> {
  await holdStill(page);

  return page.evaluate(
    ({ selector, gap }) => {
      const popover = document.querySelector(selector)?.getBoundingClientRect();
      const target = document.querySelector<HTMLElement>("[data-tour-active]");
      if (!popover || !target) return Number.POSITIVE_INFINITY;

      const covered = (box: DOMRect) => {
        const width = Math.min(popover.right, box.right) - Math.max(popover.left, box.left);
        const height = Math.min(popover.bottom, box.bottom) - Math.max(popover.top, box.top);
        return width > 0 && height > 0 ? width * height : 0;
      };
      const labelledBy = target.getAttribute("aria-labelledby");
      const heading =
        (labelledBy ? document.getElementById(labelledBy) : null) ??
        target.querySelector("h1, h2, h3, h4") ??
        target;
      const box = target.getBoundingClientRect();
      const fitsBeside =
        box.height + popover.height + gap * 3 <= window.innerHeight ||
        Math.max(box.left, window.innerWidth - box.right) >= popover.width + gap * 2;

      return covered(heading.getBoundingClientRect()) + (fitsBeside ? covered(box) : 0);
    },
    { selector: TOUR_SELECTOR, gap: SIDE_OFFSET + 4 },
  );
}

test.describe("guided tour on a page under a sticky header and tab bar", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const [width, height] of [
    [390, 664],
    [390, 844],
  ] as const) {
    test(`never covers a step's heading, nor its target when both fit, on Réglages at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await forgetTours(page);
      await page.goto("/settings");

      const tour = page.locator(TOUR_SELECTOR);
      for (const step of [1, 2, 3, 4]) {
        await expect(tour.getByText(`Étape ${step} sur 4`)).toBeVisible();
        await expect.poll(() => avoidableCover(page), { message: `step ${step}` }).toBe(0);
        await expect(tour.getByRole("button", { name: /Suivant|C'est parti/ })).toBeInViewport();
        if (step < 4) await tour.getByRole("button", { name: "Suivant" }).click();
      }
    });
  }
});

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
    [390, 664],
    [375, 548],
    [390, 844],
    [844, 390],
    [1440, 900],
  ] as const) {
    for (const [length, title, reminders] of [
      ["short", "Piscine", 1],
      ["long", REVIEW_EVENT.title, 5],
    ] as const) {
      test(`never covers a step's heading, nor its target when both fit, at ${width}x${height} with a ${length} title`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await forgetTours(page);
        await serveFamily(page, {
          children: [LEA],
          events: EVENTS,
          detail: { ...REVIEW_EVENT, title, category: "swimming" },
          reminders,
        });
        await page.goto(`/?event=${REVIEW_EVENT.id}`);

        const tour = page.locator(TOUR_SELECTOR);
        for (const step of [1, 2, 3, 4]) {
          await expect(tour.getByText(`Étape ${step} sur 4`)).toBeVisible();
          await expect.poll(() => avoidableCover(page), { message: `step ${step}` }).toBe(0);

          const primary = tour.getByRole("button", { name: /Suivant|C'est parti/ });
          await expect(primary).toBeInViewport();
          expect(await controlsOverflow(page)).toBe(0);
          if (step < 4) await primary.click();
        }
      });
    }
  }
});
