import { shiftDate, weekdayOf } from "@packages/ddd-kit/days";
import { blockingViolations, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import {
  AGENDA_WITHOUT_OVERDUE_BLOCK,
  EVENTS,
  inDays,
  LEA,
  MAXIMILIEN,
  parisTime,
  REVIEW_EVENT,
  serveFamily,
  TODAY,
  todayAt,
} from "./events-fixtures";
import { lowestGraphicContrast } from "./graphic-contrast";
import { STORAGE_STATE } from "./playwright.config";
import type { Block } from "./served-layout";

const FRIDAY = 5;
/** Late before the Monday of the shown week, whatever today is: the planner holds the rest itself. */
const LATE_BEFORE_THE_WEEK = -10;
/** A deadline title in a column of the week planner keeps room for a word of 10 letters a line. */
const MIN_COLUMN_TITLE_PX = 72;

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

async function expectWeekRowsUnderBriefing(page: Page): Promise<void> {
  const columns = page.locator(
    "[data-slot=calendar-week][data-arrangement=board] [data-slot=calendar-day]",
  );
  await expect(columns).toHaveCount(7);
  const titles = page.locator("[data-slot=calendar-week] [data-slot=calendar-entry-link]");
  await expect(titles.first()).toBeVisible();
  const misdrawn = await titles.evaluateAll(
    (links) =>
      links.filter((link) => {
        const lines = link.clientHeight / Number.parseFloat(getComputedStyle(link).lineHeight);

        return link.scrollWidth > link.clientWidth + 1 || Math.round(lines) > 2;
      }).length,
  );
  expect(misdrawn).toBe(0);
  const widths = await titles.evaluateAll((links) =>
    links.map((link) => link.getBoundingClientRect().width),
  );
  expect(Math.min(...widths)).toBeGreaterThanOrEqual(MIN_COLUMN_TITLE_PX);
  const briefing = await page.locator("[data-block=today]").boundingBox();
  const week = await page.locator("[data-slot=calendar-week]").boundingBox();
  expect(briefing && week && briefing.y + briefing.height <= week.y).toBe(true);
}

function comingFriday(): string {
  return inDays((FRIDAY - weekdayOf(TODAY) + 7) % 7);
}

/**
 * On Friday evening the planner already shows the week Monday opens, the very day "Pour ce soir"
 * prepares: both read the school day of the shared clock, so they never speak of two days.
 */
/** The evening's block placed by hand beside the Agenda, whatever the advice crowns. */
const TONIGHT_BESIDE_THE_AGENDA: Block[] = [
  { id: "tonight", size: { w: 2, h: 1 } },
  { id: "calendar", size: { w: 4, h: 2 } },
];

/** The briefing kept on the home in the evening, when the advice leads with "Pour ce soir" instead. */
const WITH_BRIEFING: Block[] = [
  { id: "today", size: { w: 2, h: 2 } },
  { id: "calendar", size: { w: 4, h: 2 } },
];

async function expectNextWeekOnFridayEvening(page: Page): Promise<void> {
  const friday = comingFriday();
  const monday = shiftDate(friday, 3);
  await page.clock.setFixedTime(parisTime(friday, "17:00"));
  await serveFamily(page, {
    children: [LEA, MAXIMILIEN],
    events: EVENTS,
    homeLayout: TONIGHT_BESIDE_THE_AGENDA,
  });
  await page.goto("/");

  const week = page.locator("[data-slot=calendar-week][data-arrangement=board]");
  const columns = week.locator("[data-slot=calendar-day]");
  await expect(columns).toHaveCount(7);
  await expect(columns.first()).toHaveAttribute("data-jump", monday);
  const mondayName = await columns
    .first()
    .locator("[data-slot=calendar-day-mark] .sr-only")
    .textContent();
  await expect(page.getByRole("region", { name: "Pour ce soir" })).toContainText(
    new RegExp(mondayName ?? "", "i"),
  );
  await expect(page.getByRole("button", { name: "Revenir à aujourd'hui" })).toHaveCount(0);
}

async function expectOverdueOverlay(
  page: Page,
  colorScheme: (typeof COLOR_SCHEMES)[number],
): Promise<void> {
  await page.clock.setFixedTime(todayAt("09:00"));
  await showColorScheme(page, colorScheme);
  const late = {
    ...REVIEW_EVENT,
    id: "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a80",
    childId: MAXIMILIEN.id,
    title: "Cahier de liaison à signer",
    status: "confirmed",
    done: false,
    deadlineDate: inDays(LATE_BEFORE_THE_WEEK),
    deadlineAt: `${inDays(LATE_BEFORE_THE_WEEK)}T07:00:00.000Z`,
  };
  await serveFamily(page, {
    children: [LEA, MAXIMILIEN],
    events: [late],
    homeLayout: AGENDA_WITHOUT_OVERDUE_BLOCK,
  });
  await page.goto("/");

  const line = page.getByRole("button", { name: "En retard, 1 échéance" });
  await expect(line).toHaveAttribute("aria-haspopup", "dialog");
  await line.focus();
  await page.keyboard.press("Enter");
  const overlay = page.getByRole("dialog", { name: "En retard, 1 échéance" });
  await expect(overlay.getByRole("link", { name: late.title })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: late.title })).toHaveCount(0);
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await overlay.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
  }
  expect(await blockingViolations(page)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(overlay).toBeHidden();
  await expect(line).toBeFocused();
  await expectOnePageWithoutOverflow(page);
}

async function clippedInScrollRegions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const reachOf = (element: Element): number => {
      const style = getComputedStyle(element);
      if (element.matches("[data-slot=child-avatar]"))
        return Number.parseFloat(style.getPropertyValue("--tw-ring-offset-width")) + 2;

      return Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ring-width"),
      );
    };

    return [...document.querySelectorAll("[data-slot=scroll-region]")].flatMap((region) => {
      const edge = region.getBoundingClientRect();
      const marks = region.querySelectorAll("[data-slot=child-avatar], a[href], button");

      return [...marks].flatMap((mark) => {
        const box = mark.getBoundingClientRect();
        const reach = reachOf(mark);
        const clipped = box.left - reach < edge.left || box.right + reach > edge.right;

        return clipped
          ? [`${mark.getAttribute("data-slot") ?? mark.tagName} ${mark.textContent}`]
          : [];
      });
    });
  });
}

test.describe("the calendar on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`two children, a blocked one and an event to review (${colorScheme})`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(todayAt("09:00"));
      await showColorScheme(page, colorScheme);
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
      await page.goto("/");

      const review = page.getByRole("button", { name: "Voir la date à vérifier" });
      await expect(review).toHaveAttribute("aria-haspopup", "dialog");
      await expect(page.getByRole("link", { name: "Que faire ?" })).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "Agenda" })
          .getByRole("link", { name: REVIEW_EVENT.title, exact: true }),
      ).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);

      await review.click();
      const dialog = page.getByRole("dialog", { name: "1 date à vérifier" });
      await expect(dialog.getByRole("button", { name: "C'est bon" })).toBeVisible();
      await expect(dialog.getByText(REVIEW_EVENT.evidence.quote)).toBeVisible();
      await expect(dialog.getByRole("link", { name: "Modifier" })).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(review).toBeFocused();

      const block = page.getByRole("region", { name: "À vérifier" });
      const confirm = block.getByRole("button", { name: `C'est bon : ${REVIEW_EVENT.title}` });
      await confirm.focus();
      await page.keyboard.press("Tab");
      await expect(
        block.getByRole("link", { name: `Corriger : ${REVIEW_EVENT.title}` }),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      const confirmed = page.waitForRequest(
        (request) => request.method() === "POST" && request.url().endsWith("/confirm"),
      );
      await page.keyboard.press("Enter");
      await confirmed;
      const allClear = block.locator("[data-slot=dashboard-panel-empty]");
      await expect(allClear).toBeFocused();
      await expect(
        page.locator("[aria-live]").getByText(`${REVIEW_EVENT.title} : date confirmée`),
      ).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
      const unconfirmed = page.waitForRequest(
        (request) => request.method() === "DELETE" && request.url().endsWith("/confirm"),
      );
      await page.getByRole("button", { name: "Annuler" }).click();
      await expect(confirm).toBeVisible();
      await unconfirmed;
    });

    test(`a late deadline waits folded above the week and opens in a drawer (${colorScheme})`, async ({
      page,
    }) => {
      await expectOverdueOverlay(page, colorScheme);
    });

    test(`the next school moment, per child with what to prepare (${colorScheme})`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(todayAt("19:00"));
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
      await serveFamily(page, {
        children: [LEA, { ...LEA, ...TOM }],
        events: [tonight, swimming],
        homeLayout: WITH_BRIEFING,
      });
      await page.goto("/");

      const briefing = page.getByRole("region", { name: "Pour demain", exact: true });
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

      await expect(page.getByText(/analyse en cours/).first()).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("the briefing lists its whole day inside its block, a region the keyboard reaches", async ({
    page,
  }) => {
    await page.clock.setFixedTime(todayAt("19:00"));
    const due = Array.from({ length: 6 }, (_, index) => ({
      ...REVIEW_EVENT,
      id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0${index}`,
      title: `Piscine ${index + 1}`,
      category: "swimming",
      status: "confirmed",
      deadlineDate: inDays(1),
      deadlineAt: `${inDays(1)}T07:00:00.000Z`,
    }));
    await serveFamily(page, { children: [LEA], events: due, homeLayout: WITH_BRIEFING });
    await page.goto("/");

    const briefing = page.locator("[data-block=today]");
    await expect(briefing.getByRole("link", { name: "Piscine 1" })).toBeVisible();
    await expect(briefing.getByRole("link", { name: /^Piscine / })).toHaveCount(6);
    await expect(briefing.getByRole("button", { name: /^Voir / })).toHaveCount(0);

    const region = briefing.getByRole("group", { name: "Pour demain" });
    await tabTo(page, region);
    await expect(region).toBeFocused();
  });

  for (const { home, homeLayout } of [
    { home: "the advised evening home", homeLayout: undefined },
    { home: "a home that keeps the briefing", homeLayout: WITH_BRIEFING },
  ])
    test(`${home} clips neither an avatar ring nor a focus ring, nor the page`, async ({
      page,
    }) => {
      await page.clock.setFixedTime(todayAt("19:00"));
      const due = Array.from({ length: 6 }, (_, index) => ({
        ...REVIEW_EVENT,
        id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c1${index}`,
        title: `Piscine ${index + 1}`,
        category: "swimming",
        status: "confirmed",
        deadlineDate: inDays(1),
        deadlineAt: `${inDays(1)}T07:00:00.000Z`,
      }));
      await serveFamily(page, { children: [LEA], events: due, homeLayout });
      await page.goto("/");

      const lead = homeLayout ? page.locator("[data-block=today]") : page.locator("[data-hero]");
      await expect(lead.getByText("Piscine 1", { exact: true })).toBeVisible();
      await expectOnePageWithoutOverflow(page);
      expect(await clippedInScrollRegions(page)).toEqual([]);
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

  test("the week strip names the seven days and takes the picked one to its row", async ({
    page,
  }) => {
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    const strip = page.getByRole("radiogroup", { name: "Jours de la semaine" });
    await expect(strip.getByRole("radio")).toHaveCount(7);
    await strip.scrollIntoViewIfNeeded();
    await expect(strip).toBeInViewport();
    const homework = page.getByRole("link", { name: "Exercices 4 à 9 page 112", exact: true });
    await expect(homework).toBeVisible();
    const row = page.locator("[data-slot=calendar-week] [data-slot=calendar-day]", {
      has: homework,
    });
    const date = await row.getAttribute("data-jump");
    const shown = Array.from({ length: 7 }, (_, index) => inDays(3 + index));
    await strip
      .getByRole("radio")
      .nth(shown.indexOf(date ?? ""))
      .click();
    await expect(row).toBeFocused();
    await expect(row).toBeInViewport();
    await expectOnePageWithoutOverflow(page);
    expect(await blockingViolations(page)).toEqual([]);
  });
});

test.describe("event overlay focus", () => {
  test.use({ storageState: STORAGE_STATE });

  test("the sheet gives focus back to the sticker that opened it on Escape", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.setFixedTime(todayAt("09:00"));
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

  for (const width of [390, 1440]) {
    test(`a deadline opened low in the agenda keeps the page where it was (${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 500 });
      await page.clock.setFixedTime(todayAt("09:00"));
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
      await page.goto("/");
      await expect(
        page.locator("[data-slot=calendar-week] a[href^='/events/']").first(),
      ).toBeVisible();

      const card = page.locator("[data-slot=calendar-week] a[href^='/events/']").last();
      await card.scrollIntoViewIfNeeded();
      const scrolled = await page.evaluate(() => window.scrollY);
      expect(scrolled).toBeGreaterThan(0);
      await page.evaluate(() => {
        document.querySelector("main")?.setAttribute("data-before-open", "");
      });

      await card.click();
      const overlay = page.getByRole("dialog");
      await expect(overlay).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
      await expect(page.locator("main[data-before-open]")).toHaveCount(1);

      await page.keyboard.press("Escape");
      await expect(overlay).toBeHidden();
      await expect(card).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

      await card.click();
      await expect(overlay).toBeVisible();
      await page.goBack();
      await expect(overlay).toBeHidden();
      expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
      await expect(page.locator("main[data-before-open]")).toHaveCount(1);
    });
  }

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

  test("puts the week planner under the briefing, without the day strip", async ({ page }) => {
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    await expectWeekRowsUnderBriefing(page);
    await expect(page.getByRole("radiogroup", { name: "Jours de la semaine" })).toBeHidden();
    await expectOnePageWithoutOverflow(page);
  });

  test("already shows the week Monday opens on Friday evening, like Pour ce soir", async ({
    page,
  }) => {
    await expectNextWeekOnFridayEvening(page);
  });
});

test.describe("the week on a desktop", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("shows the week as a planner of titles on two lines at most, under the briefing", async ({
    page,
  }) => {
    await page.clock.setFixedTime(todayAt("09:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: EVENTS });
    await page.goto(`/?view=week&date=${inDays(3)}`);

    await expectWeekRowsUnderBriefing(page);
    await expectOnePageWithoutOverflow(page);
  });

  test("already shows the week Monday opens on Friday evening, like Pour ce soir", async ({
    page,
  }) => {
    await expectNextWeekOnFridayEvening(page);
  });
});

test.describe("the late deadlines on a desktop", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  for (const colorScheme of COLOR_SCHEMES)
    test(`open in a dialog that gives focus back to their line (${colorScheme})`, async ({
      page,
    }) => {
      await expectOverdueOverlay(page, colorScheme);
    });
});

test.describe("a done tick inside the late deadlines overlay", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const width of [390, 1440])
    test(`is undone from inside it, by pointer and by keyboard (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(todayAt("09:00"));
      const late = {
        ...REVIEW_EVENT,
        id: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02",
        title: "Mot du carnet à signer",
        status: "confirmed",
        done: false,
        deadlineDate: inDays(LATE_BEFORE_THE_WEEK),
        deadlineAt: `${inDays(LATE_BEFORE_THE_WEEK)}T07:00:00.000Z`,
      };
      await serveFamily(page, {
        children: [LEA],
        events: [late],
        homeLayout: AGENDA_WITHOUT_OVERDUE_BLOCK,
      });
      await page.route(`**/events/${late.id}/done`, (route) => {
        late.done = route.request().method() === "POST";
        return route.fulfill({ json: late });
      });
      await page.goto("/");

      await page.getByRole("button", { name: "En retard, 1 échéance" }).click();
      const overlay = page.getByRole("dialog");
      const tick = overlay.getByRole("checkbox", { name: `Marquer comme fait : ${late.title}` });
      const undo = overlay.getByRole("button", { name: "Annuler" });

      await tick.click();
      await expect(overlay.getByRole("status")).toHaveText(/Marqué comme fait/);
      await undo.click();
      await expect(tick).toHaveAttribute("aria-checked", "false");
      await expect(overlay).toBeVisible();
      expect(late.done).toBe(false);

      await tick.focus();
      await page.keyboard.press("Space");
      await expect(undo).toBeVisible();
      for (
        let step = 0;
        step < 6 && !(await undo.evaluate((el) => el === document.activeElement));
        step++
      )
        await page.keyboard.press("Tab");
      await expect(undo).toBeFocused();
      expect(await blockingViolations(page)).toEqual([]);
      await page.keyboard.press("Enter");
      await expect(tick).toHaveAttribute("aria-checked", "false");
      await expect(overlay).toBeVisible();
      expect(late.done).toBe(false);
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
      await page.clock.setFixedTime(parisTime("2026-11-12", "09:00"));
      await showColorScheme(page, colorScheme);
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: [...crunch, single] });
      await page.goto("/?view=month&date=2026-11-25");
      await expect(page.locator('[data-day="2026-11-17"] [data-slot=hue-dot]')).toHaveCount(3);

      expect(await lowestGraphicContrast(page, "[data-slot=hue-dot]")).toBeGreaterThanOrEqual(3);
    });
  }

  test("a crunch day keeps its whole date next to the badge", async ({ page }) => {
    await page.clock.setFixedTime(parisTime("2026-11-12", "09:00"));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: crunch });
    await page.goto("/?view=week&date=2026-11-17");

    const title = page.getByRole("heading", { level: 3, name: "Mardi 17 novembre" });
    await expect(title).toBeVisible();
    expect(await title.evaluate((heading) => heading.scrollWidth <= heading.clientWidth)).toBe(
      true,
    );
    await expectOnePageWithoutOverflow(page);
  });
});

test.describe("a list that scrolls on its own", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 700 } });

  for (const reducedMotion of ["no-preference", "reduce"] as const)
    test(`fades through a mask only on the side with content left, the first item whole (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await page.clock.setFixedTime(todayAt("09:00"));
      const late = Array.from({ length: 12 }, (_, index) => ({
        ...REVIEW_EVENT,
        id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9d${String(index).padStart(2, "0")}`,
        title: `Devoir oublié ${index + 1}`,
        status: "confirmed",
        done: false,
        deadlineDate: inDays(-1 - (index % 6)),
        deadlineAt: `${inDays(-1 - (index % 6))}T07:00:00.000Z`,
      }));
      await serveFamily(page, {
        children: [LEA],
        events: late,
        homeLayout: AGENDA_WITHOUT_OVERDUE_BLOCK,
      });
      await page.goto("/");

      await page.getByRole("button", { name: "En retard, 12 échéances" }).click();
      const list = page.getByRole("dialog").locator("[data-slot=scroll-region]");
      await expect(list.getByRole("link").first()).toBeVisible();
      const fade = () =>
        list.evaluate((region) => {
          const style = getComputedStyle(region);

          return {
            masked: style.maskImage.startsWith("linear-gradient"),
            veils: [
              getComputedStyle(region, "::before").content,
              getComputedStyle(region, "::after").content,
            ],
            topFades: Number.parseFloat(style.getPropertyValue("--scroll-fade-top")) > 0,
            bottomFades: Number.parseFloat(style.getPropertyValue("--scroll-fade-bottom")) > 0,
          };
        });

      expect(await list.evaluate((region) => region.scrollHeight > region.clientHeight)).toBe(true);
      await expect
        .poll(fade)
        .toEqual({ masked: true, veils: ["none", "none"], topFades: false, bottomFades: true });

      await list.evaluate((region) => region.scrollTo({ top: region.scrollHeight }));
      await expect
        .poll(fade)
        .toEqual({ masked: true, veils: ["none", "none"], topFades: true, bottomFades: false });
    });
});

test.describe("the bar of the day", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  for (const colorScheme of COLOR_SCHEMES)
    test(`fills in ink at 3:1 or more against its track (${colorScheme})`, async ({ page }) => {
      await showColorScheme(page, colorScheme);
      await page.clock.setFixedTime(todayAt("19:00"));
      const due = [0, 1].map((index) => ({
        ...REVIEW_EVENT,
        id: `7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9e0${index}`,
        title: `Piscine ${index + 1}`,
        category: "swimming",
        status: "confirmed",
        done: index === 0,
        deadlineDate: inDays(1),
        deadlineAt: `${inDays(1)}T07:00:00.000Z`,
      }));
      await serveFamily(page, { children: [LEA], events: due, homeLayout: WITH_BRIEFING });
      await page.goto("/");

      const bar = page.locator("[data-block=today]").getByRole("progressbar");
      await expect(bar).toHaveAttribute("aria-valuetext", "1 sur 2");
      expect(
        await lowestGraphicContrast(page, "[data-block=today] [data-slot=progress-indicator]"),
      ).toBeGreaterThanOrEqual(3);
    });
});
