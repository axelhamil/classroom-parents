import { blockingViolations } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { expect, test } from "./csp";
import { inDays, LEA, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const PAST = 160;
const PAGE_SIZE = 50;
const WALKED = 70;

const HISTORY = Array.from({ length: PAST }, (_, index) => ({
  ...REVIEW_EVENT,
  id: `6d1e2f3a-4b5c-4d6e-8f7a-${String(index).padStart(12, "0")}`,
  title: `Exercices ${index + 1} page ${100 + index}`,
  category: "homework",
  status: "confirmed",
  done: true,
  deadlineDate: inDays(-1 - Math.floor(index / 2)),
  deadlineAt: `${inDays(-1 - Math.floor(index / 2))}T07:00:00.000Z`,
}));

async function openLongHistory(page: Page): Promise<void> {
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA], events: [] });
  await page.route(
    (url) => url.pathname === "/events" && url.searchParams.get("scope") === "history",
    (route) => {
      const from = Number(new URL(route.request().url()).searchParams.get("cursor") ?? 0);
      const next = from + PAGE_SIZE;
      return route.fulfill({
        json: {
          items: HISTORY.slice(from, next),
          nextCursor: next < HISTORY.length ? String(next) : null,
        },
      });
    },
  );
  await page.goto("/?tab=history");
  const more = page.getByRole("button", { name: "Afficher les suivantes" });
  for (let loaded = PAGE_SIZE; loaded < PAST; loaded += PAGE_SIZE) {
    await more.click();
    await expect(page.locator("main li[aria-setsize]").first()).toHaveAttribute(
      "aria-setsize",
      String(Math.min(loaded + PAGE_SIZE, PAST)),
    );
  }
  await expect(more).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator("main li[aria-posinset='1']")).toBeVisible();
}

function focusedPosition(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const row = document.activeElement?.closest("[aria-posinset]");
    return row ? Number(row.getAttribute("aria-posinset")) : null;
  });
}

test.describe("a long history mounts only its visible rows", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  test("each row tells its place in the whole list and the page stays clean", async ({ page }) => {
    await openLongHistory(page);
    const rows = page.locator("main li[aria-setsize]");

    expect(await rows.count()).toBeLessThan(PAST);
    await expect(rows.first()).toHaveAttribute("aria-setsize", String(PAST));
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("Tab walks every row in order, past the ones mounted at first", async ({ page }) => {
    await openLongHistory(page);
    await page.locator("main li[aria-posinset='1'] a").first().focus();

    const walked = [await focusedPosition(page)];
    for (let step = 0; step < WALKED; step++) {
      await page.keyboard.press("Tab");
      walked.push(await focusedPosition(page));
    }

    expect(walked).toEqual(Array.from({ length: WALKED + 1 }, (_, index) => index + 1));

    await page.keyboard.press("Shift+Tab");
    expect(await focusedPosition(page)).toBe(WALKED);
  });

  test("the focused row stays mounted when the page scrolls far away from it", async ({ page }) => {
    await openLongHistory(page);
    const first = page.locator("main li[aria-posinset='2'] a").first();
    await first.focus();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.locator("main li[aria-posinset='2']")).toHaveCount(1);
    await expect(page.locator(`main li[aria-posinset='${PAST}']`)).toBeAttached();
    await expect(first).toBeFocused();

    await page.keyboard.press("Tab");
    expect(await focusedPosition(page)).toBe(3);
  });
});

const TO_CHECK = Array.from({ length: 80 }, (_, index) => ({
  ...REVIEW_EVENT,
  id: `5c0d1e2f-3a4b-4c5d-8e6f-${String(index).padStart(12, "0")}`,
  title: `Sortie ${index + 1} : date à confirmer`,
  deadlineDate: inDays(1 + (index % 20)),
  deadlineAt: `${inDays(1 + (index % 20))}T07:00:00.000Z`,
}));

test.describe("a long list of dates to check inside its dialog", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("Tab walks the rows in order without leaving the dialog", async ({ page }) => {
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA], events: TO_CHECK });
    await page.goto("/");
    await page.getByRole("button", { name: "80 dates à vérifier" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("li[aria-setsize='80']").first()).toBeVisible();
    await dialog.locator("li[aria-posinset='1'] a").first().focus();

    const walked: number[] = [];
    for (let step = 0; step < 90; step++) {
      await page.keyboard.press("Tab");
      const position = await focusedPosition(page);
      if (position !== null) walked.push(position);
    }

    expect(walked).toEqual([...walked].sort((left, right) => left - right));
    expect(walked.at(-1)).toBeGreaterThan(20);
    expect(await blockingViolations(page)).toEqual([]);
  });
});
