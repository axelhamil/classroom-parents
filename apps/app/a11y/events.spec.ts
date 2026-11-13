import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { expect, type Page, test } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { EVENTS, inDays, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { lowestGraphicContrast } from "./graphic-contrast";
import { STORAGE_STATE } from "./playwright.config";

const TOM = {
  id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
  label: "Tom",
  googleEmail: "tom@example.com",
};

async function expectOnePageWithoutOverflow(page: Page): Promise<void> {
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const views = page.getByRole("tablist", { name: "Vue des échéances" });
  if ((await views.count()) === 0) return;

  expect(await views.evaluate((list) => list.scrollWidth <= list.clientWidth)).toBe(true);
}

test.describe("the calendar on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`two children, a blocked one and an event to review (${colorScheme})`, async ({
      page,
    }) => {
      const morning = new Date();
      morning.setHours(9, 0, 0, 0);
      await page.clock.setFixedTime(morning);
      await showColorScheme(page, colorScheme);
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
      await page.goto("/");

      await expect(page.getByRole("heading", { level: 2, name: "À vérifier" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Voir les enfants" })).toBeVisible();
      await expect(page.getByRole("link", { name: REVIEW_EVENT.title, exact: true })).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });

    test(`a late deadline sits above the period (${colorScheme})`, async ({ page }) => {
      const morning = new Date();
      morning.setHours(9, 0, 0, 0);
      await page.clock.setFixedTime(morning);
      await showColorScheme(page, colorScheme);
      const late = {
        ...REVIEW_EVENT,
        id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a80",
        childId: MAXIMILIEN.id,
        title: "Cahier de liaison à signer",
        status: "confirmed",
        done: false,
        deadlineDate: inDays(-3),
        deadlineAt: `${inDays(-3)}T07:00:00.000Z`,
      };
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: [late] });
      await page.goto("/");

      const strip = page.getByRole("region", { name: "En retard" });
      await expect(strip.getByRole("link", { name: late.title })).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });

    test(`the next school moment, per child with what to prepare (${colorScheme})`, async ({
      page,
    }) => {
      const evening = new Date();
      evening.setHours(19, 0, 0, 0);
      await page.clock.setFixedTime(evening);
      await showColorScheme(page, colorScheme);
      const tonight = {
        ...REVIEW_EVENT,
        id: "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b91",
        title: "Exercices en ligne à terminer",
        category: "homework",
        status: "confirmed",
        deadlineDate: inDays(0),
        deadlineAt: `${inDays(0)}T21:59:00.000Z`,
      };
      const swimming = {
        ...tonight,
        id: "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b92",
        title: "Piscine",
        category: "swimming",
        deadlineDate: inDays(1),
        deadlineAt: `${inDays(1)}T07:00:00.000Z`,
      };
      await serveFamily(page, { children: [LEA, { ...LEA, ...TOM }], events: [tonight, swimming] });
      await page.goto("/");

      const briefing = page.getByRole("region", { name: /^Pour / });
      await expect(briefing.getByRole("region", { name: LEA.label })).toBeVisible();
      await expect(briefing.getByRole("link", { name: tonight.title })).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });

    test(`first sync still running (${colorScheme})`, async ({ page }) => {
      await showColorScheme(page, colorScheme);
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

  test("the briefing scrolls on its own from the keyboard, its items in the tab order", async ({
    page,
  }) => {
    const evening = new Date();
    evening.setHours(19, 0, 0, 0);
    await page.clock.setFixedTime(evening);
    const due = Array.from({ length: 6 }, (_, index) => ({
      ...REVIEW_EVENT,
      id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0${index}`,
      title: `Piscine ${index + 1}`,
      category: "swimming",
      status: "confirmed",
      deadlineDate: inDays(1),
      deadlineAt: `${inDays(1)}T07:00:00.000Z`,
    }));
    await serveFamily(page, { children: [LEA], events: due });
    await page.goto("/");

    const briefing = page.getByRole("region", { name: /^Pour / });
    const scroller = briefing.getByRole("region", { name: /^Échéances à préparer pour / });
    await expect(scroller.getByRole("link", { name: "Piscine 1" })).toBeVisible();
    expect(await scroller.evaluate((region) => region.scrollHeight > region.clientHeight)).toBe(
      true,
    );
    const box = await briefing.boundingBox();
    expect(box && box.height <= 844 * 0.4 + 1).toBe(true);

    await scroller.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => scroller.evaluate((region) => region.scrollTop)).toBeGreaterThan(0);
    await expect(briefing.getByText(/^Encore 6 échéances/)).toBeInViewport();

    await page.keyboard.press("Tab");
    expect(await scroller.evaluate((region) => region.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Shift+Tab");
    await expect(scroller).toBeFocused();
  });

  test("a category chip of the history filters through the url and the request", async ({
    page,
  }) => {
    const requests = await serveFamily(page, { children: [LEA], events: EVENTS });
    await page.goto("/?tab=history");

    const swimming = page.getByRole("button", { name: "Piscine" });
    await swimming.click();

    await expect(page).toHaveURL(/[?&]category=swimming/);
    await expect(swimming).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => requests.map((request) => new URL(request.url()).searchParams.get("category")))
      .toContain("swimming");
  });

  test("the week ribbon opens the picked day under it", async ({ page }) => {
    const morning = new Date();
    morning.setHours(9, 0, 0, 0);
    await page.clock.setFixedTime(morning);
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    const ribbon = page.getByRole("radiogroup", { name: "Jours de la semaine" });
    await expect(ribbon.getByRole("radio")).toHaveCount(7);
    await expect(
      page.getByRole("link", { name: "Exercices 4 à 9 page 112", exact: true }),
    ).toBeVisible();
    await expectOnePageWithoutOverflow(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
});

test.describe("event overlay focus", () => {
  test.use({ storageState: STORAGE_STATE });

  test("the sheet gives focus back to the sticker that opened it on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto("/");

    const sticker = page
      .locator("[data-slot=calendar-day]")
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

test.describe("the week on a tablet", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 768, height: 1024 } });

  test("keeps the day ribbon until seven columns can hold a title", async ({ page }) => {
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    await expect(page.getByRole("radiogroup", { name: "Jours de la semaine" })).toBeVisible();
    await expectOnePageWithoutOverflow(page);
  });
});

test.describe("the week on a desktop", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("keeps the seven columns readable beside the briefing, and only the calendar widens", async ({
    page,
  }) => {
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    const columns = page.locator("[data-slot=calendar-period] [data-slot=calendar-day]");
    await expect(columns).toHaveCount(7);
    const widths = await columns.evaluateAll((days) =>
      days.map((day) => day.getBoundingClientRect().width),
    );
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(120);
    const briefing = await page.locator("[data-slot=briefing]").boundingBox();
    const week = await page.locator("[data-slot=calendar-period]").boundingBox();
    expect(briefing && week && briefing.x + briefing.width < week.x).toBe(true);
    expect(week && week.y < 900).toBe(true);
    await expectOnePageWithoutOverflow(page);

    await page.goto("/settings");
    const settings = await page.locator("main").evaluate((main) => main.clientWidth);
    expect(settings).toBeLessThanOrEqual(1024);
  });
});

test.describe("the child dots of the month", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  const crunch = [LEA, MAXIMILIEN, LEA].map((child, index) => ({
    ...REVIEW_EVENT,
    id: `3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6${index}`,
    childId: child.id,
    title: `Devoir ${index + 1}`,
    status: "confirmed",
    deadlineDate: "2026-11-17",
    deadlineAt: "2026-11-17T07:00:00.000Z",
  }));
  const single = {
    ...crunch[0],
    id: "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e70",
    deadlineDate: "2026-11-19",
  };

  for (const colorScheme of COLOR_SCHEMES) {
    test(`stand out at 3:1 on a plain and a crunch day (${colorScheme})`, async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-11-12T09:00:00"));
      await showColorScheme(page, colorScheme);
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: [...crunch, single] });
      await page.goto("/?view=month&date=2026-11-25");
      await expect(page.locator('[data-day="2026-11-17"] [data-slot=hue-dot]')).toHaveCount(3);

      expect(await lowestGraphicContrast(page, "[data-slot=hue-dot]")).toBeGreaterThanOrEqual(3);
    });
  }

  test("a crunch day keeps its whole date next to the badge", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-12T09:00:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: crunch });
    await page.goto("/?view=agenda&date=2026-11-17");

    const title = page.getByRole("heading", { level: 3, name: "Mardi 17 novembre" });
    await expect(title).toBeVisible();
    expect(await title.evaluate((heading) => heading.scrollWidth <= heading.clientWidth)).toBe(
      true,
    );
    await expectOnePageWithoutOverflow(page);
  });
});
