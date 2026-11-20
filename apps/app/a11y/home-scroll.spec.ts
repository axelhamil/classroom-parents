import { tabTo } from "@packages/test/a11y";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./csp";
import { inDays, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const ARRANGED = [
  { id: "today", size: "l" },
  { id: "overdue", size: "m" },
  { id: "assessments", size: "m" },
  { id: "calendar", size: "xl" },
  { id: "review", size: "s" },
  { id: "progress", size: "s" },
  { id: "documents", size: "s" },
  { id: "outings", size: "s" },
];

const LATE = Array.from({ length: 9 }, (_, index) => ({
  ...REVIEW_EVENT,
  id: `5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7b${String(index).padStart(2, "0")}`,
  childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
  title: `Devoir oublié ${index + 1}`,
  status: "confirmed",
  done: false,
  deadlineDate: inDays(-1 - index),
  deadlineAt: `${inDays(-1 - index)}T07:00:00.000Z`,
}));

const TRANSPARENT = "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)";

async function openHome(page: Page): Promise<void> {
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: LATE, homeLayout: ARRANGED });
  await page.goto("/");
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
}

function lateRegion(page: Page): Locator {
  return page
    .locator("[data-block=overdue]")
    .getByRole("group", { name: "En retard", exact: true });
}

async function overflowingLateRegion(page: Page): Promise<Locator> {
  const region = lateRegion(page);
  await expect(region.getByRole("link", { name: "Devoir oublié 9" })).toBeAttached();
  expect(await region.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  return region;
}

function fadeOf(region: Locator): Promise<{ top: number; bottom: number }> {
  return region.evaluate((el) => {
    const style = getComputedStyle(el);

    return {
      top: Number.parseFloat(style.getPropertyValue("--scroll-fade-top")) || 0,
      bottom: Number.parseFloat(style.getPropertyValue("--scroll-fade-bottom")) || 0,
    };
  });
}

function scrollToEnd(region: Locator): Promise<void> {
  return region.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
}

function atEnd(region: Locator): Promise<boolean> {
  return region.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
}

function scrollbarColor(region: Locator): Promise<string> {
  return region.evaluate((el) => getComputedStyle(el).scrollbarColor);
}

test.describe("a home tile scrolls inside itself", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("fades only the edges that still hide content, and never veils the region", async ({
    page,
  }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);

    await expect.poll(() => fadeOf(region)).toEqual({ top: 0, bottom: 16 });
    await scrollToEnd(region);
    await expect.poll(() => fadeOf(region)).toEqual({ top: 16, bottom: 0 });

    const veils = await region.evaluate((el) => [
      getComputedStyle(el, "::before").backgroundImage,
      getComputedStyle(el, "::after").backgroundImage,
    ]);
    expect(veils).toEqual(["none", "none"]);

    const reached = await region.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 2);

      return hit !== null && el.contains(hit);
    });
    expect(reached).toBe(true);

    const calm = await page
      .locator("[data-slot=scroll-region][data-variant=tile]")
      .evaluateAll((regions) =>
        regions
          .filter((el) => el.scrollHeight <= el.clientHeight)
          .map((el) => {
            const style = getComputedStyle(el);
            const edge = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;

            return edge("--scroll-fade-top") + edge("--scroll-fade-bottom");
          }),
      );
    expect(calm.length).toBeGreaterThan(0);
    expect(calm.every((size) => size === 0)).toBe(true);
  });

  test("chains the wheel to the page once the region reaches its end", async ({ page }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);
    expect(await region.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("auto");

    await region.scrollIntoViewIfNeeded();
    const box = await region.boundingBox();
    if (!box) throw new Error("the late region has no box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let turn = 0; turn < 10 && !(await atEnd(region)); turn++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(100);
    }
    expect(await atEnd(region)).toBe(true);
    await page.waitForTimeout(800);

    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  test("shows its thin bar only on hover, focus or while scrolling, without moving the content", async ({
    page,
  }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);
    const style = await region.evaluate((el) => {
      const computed = getComputedStyle(el);

      return {
        gutter: computed.scrollbarGutter,
        width: computed.scrollbarWidth,
        padding: computed.scrollPaddingTop,
      };
    });
    expect(style).toEqual({ gutter: "stable", width: "thin", padding: "16px" });

    expect(await scrollbarColor(region)).toBe(TRANSPARENT);
    const resting = await region.evaluate((el) => el.clientWidth);

    await region.hover();
    await expect.poll(() => scrollbarColor(region)).not.toBe(TRANSPARENT);
    expect(await region.evaluate((el) => el.clientWidth)).toBe(resting);

    await page.mouse.move(0, 0);
    await expect.poll(() => scrollbarColor(region)).toBe(TRANSPARENT);
    const flags = await region.evaluate(
      (el) =>
        new Promise<boolean[]>((resolve) => {
          const seen: boolean[] = [];
          const observer = new MutationObserver((records) => {
            for (const record of records) seen.push(record.oldValue === null);
            if (seen.at(-1) !== false) return;

            observer.disconnect();
            resolve(seen);
          });
          observer.observe(el, { attributeFilter: ["data-scrolling"], attributeOldValue: true });
          el.scrollBy({ top: 40 });
        }),
    );
    expect(flags).toEqual([true, false]);
  });

  test("is reached by Tab, named by its block, and scrolled by the arrow keys", async ({
    page,
  }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);

    await tabTo(page, region, 80);
    await expect(region).toBeFocused();
    await expect.poll(() => scrollbarColor(region)).not.toBe(TRANSPARENT);
    await page.keyboard.press("ArrowDown");
    await expect.poll(() => region.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("never folds a list behind a button, and a small block never scrolls", async ({ page }) => {
    await openHome(page);
    await overflowingLateRegion(page);

    await expect(page.locator("[data-slot=dashboard]").getByText(/^Voir (les|moins)/)).toHaveCount(
      0,
    );
    await expect(page.locator("[data-size=s]")).toHaveCount(4);
    await expect(page.locator("[data-size=s] [data-slot=scroll-region]")).toHaveCount(0);
    const clipped = await page
      .locator("[data-size=s] [data-slot=dashboard-panel-body]")
      .evaluateAll((bodies) => bodies.filter((el) => el.scrollHeight > el.clientHeight + 1).length);
    expect(clipped).toBe(0);
  });

  test("opens the week planner with today in view, never scrolling the page", async ({ page }) => {
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: LATE, homeLayout: ARRANGED });
    await page.goto(`/?view=week&date=${inDays(-3)}`);

    const agenda = page.locator("[data-block=calendar]").getByRole("group", { name: "Agenda" });
    const today = agenda.locator(`[data-jump="${inDays(0)}"]`);
    await expect(today).toBeAttached();
    await expect(agenda.locator("[data-slot=calendar-week][data-arrangement=board]")).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const [frame, day] = await Promise.all([agenda.boundingBox(), today.boundingBox()]);
    expect(frame && day && day.y >= frame.y && day.y < frame.y + frame.height).toBe(true);
  });

  test("goes inert while the home is arranged and keeps its scroll for the way back", async ({
    page,
  }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);
    await region.evaluate((el) => {
      el.scrollTop = 60;
    });
    const kept = await region.evaluate((el) => el.scrollTop);

    await page.getByRole("button", { name: "Modifier l'accueil" }).click();
    await expect(page.getByRole("group", { name: "Disposition de En retard" })).toBeVisible();
    expect(await region.evaluate((el) => el.hasAttribute("inert"))).toBe(true);
    await region.focus();
    await expect(region).not.toBeFocused();

    await page.getByRole("button", { name: "Terminé" }).click();
    await expect(region).not.toHaveAttribute("inert");
    expect(await region.evaluate((el) => el.scrollTop)).toBe(kept);
  });
});

test.describe("a home tile on a phone", () => {
  test.use({
    storageState: STORAGE_STATE,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test("hands a touch drag over to the page once the region reaches its end", async ({ page }) => {
    await openHome(page);
    const region = await overflowingLateRegion(page);
    await scrollToEnd(region);
    await region.scrollIntoViewIfNeeded();
    const box = await region.boundingBox();
    if (!box) throw new Error("the late region has no box");
    const x = box.x + box.width / 2;
    const from = box.y + box.height * 0.7;
    const before = await page.evaluate(() => window.scrollY);

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", from);
    for (let step = 1; step <= 10; step++) await touch("touchMove", from - step * 12);
    await touch("touchEnd", from - 120);

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before);
  });

  test("lets the Agenda take the height of its week and scroll with the page", async ({ page }) => {
    await openHome(page);
    const agenda = page.locator("[data-block=calendar]");
    await expect(agenda.locator("[data-slot=calendar-day]").first()).toBeVisible();

    await expect(agenda.getByRole("group", { name: "Agenda" })).toHaveCount(0);
    // The panel reaches its week's height a frame after the first day shows: read once, it can
    // still overflow by a pixel or two that is gone 70 ms later.
    const body = agenda.locator("[data-slot=dashboard-panel-body]");
    await expect
      .poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight))
      .toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(
      true,
    );
  });
});
