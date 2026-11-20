import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./csp";
import { inDays, LEA, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const MATHS = { id: "course-maths", name: "Mathématiques 4e B" };
const HISTORY = { id: "course-history", name: "Histoire-Géographie 4e B" };

const DEADLINES = [
  { ...REVIEW_EVENT, status: "confirmed", course: MATHS, title: "Fiche de fractions" },
  {
    ...REVIEW_EVENT,
    id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
    status: "confirmed",
    category: "assessment",
    course: HISTORY,
    title: "Contrôle sur la Révolution",
    deadlineDate: inDays(2),
  },
];

function toolbarOf(page: Page): Locator {
  return page.getByRole("tablist", { name: "Vue des échéances" }).locator("..");
}

/** How many rows the toolbar's controls sit on: a control starts a row when it is below every control of the row before. */
async function rowsOf(toolbar: Locator): Promise<number> {
  return toolbar.evaluate((bar) => {
    const boxes = [...bar.querySelectorAll<HTMLElement>("h2, button, [role=tablist]")]
      .filter((control) => !control.closest("[role=tablist] *"))
      .map((control) => control.getBoundingClientRect())
      .filter((box) => box.height > 0)
      .sort((left, right) => left.top - right.top);
    let rows = 0;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const box of boxes) {
      if (box.top >= bottom) rows += 1;
      bottom = Math.max(bottom, box.bottom);
    }

    return rows;
  });
}

test.describe("the agenda toolbar", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const [width, rows] of [
    [390, 2],
    [768, 1],
    [1280, 1],
  ] as const) {
    test(`fits on ${rows === 1 ? "one row" : "two rows"} at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(todayAt("09:00"));
      await serveFamily(page, { children: [LEA], events: DEADLINES });
      await page.goto("/?view=week");

      const toolbar = toolbarOf(page);
      await expect(toolbar.getByRole("heading", { level: 2 })).toBeVisible();
      expect(await rowsOf(toolbar)).toBeLessThanOrEqual(rows);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
    });
  }

  test("filters by course from one button that says how many filters are on", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA], events: DEADLINES });
    await page.goto("/?view=week");

    await page.getByRole("button", { name: "Filtrer" }).click();
    await page.getByRole("radio", { name: "Mathématiques" }).check();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("button", { name: "Filtrer, 1 filtre actif" })).toBeFocused();
    await expect(page).toHaveURL(/courseId=course-maths/);
    const agenda = page.getByRole("region", { name: "Agenda" });
    await expect(agenda.getByText("Contrôle sur la Révolution")).toHaveCount(0);
    await expect(agenda.getByText("Fiche de fractions").first()).toBeVisible();
  });

  test("announces the new period and its count once, after a step", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA], events: DEADLINES });
    await page.goto("/?view=week");

    const toolbar = toolbarOf(page);
    const live = toolbar.locator("[aria-live=polite]");
    const today = toolbar.getByRole("button", { name: "Aujourd'hui", exact: true });
    await toolbar.getByRole("button", { name: "Période suivante" }).click();

    await expect(live).toHaveText(/^Du .+, Aucune échéance$/);
    await today.click();
    await expect(live).toHaveText(/^Du .+, 2 échéances, dont 1 évaluation$/);
    await expect(today).toHaveCount(0);
  });
});
