import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import type { Locator, Page } from "@playwright/test";
import { boundsOf } from "../src/features/events/home-block-bounds";
import { type GridColumns, sizeAt } from "../src/shared/dashboard/block-size";
import { gridColumnsFor } from "../src/shared/dashboard/use-grid-columns";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { serveFamily, todayAt } from "./events-fixtures";
import { apart, arrange, cards, domOrder, finish, holes, serveLayout, settled } from "./home-board";
import { HOME_SCENARIOS, type HomeScenario } from "./home-scenarios";
import { STORAGE_STATE } from "./playwright.config";

interface Viewport {
  width: number;
  height: number;
}

const VIEWPORTS: readonly Viewport[] = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

const DESKTOP: Viewport = { width: 1440, height: 900 };

const MAX_TABS = 40;

const READ_GRID = "[data-slot=dashboard]:not([aria-hidden])";

/** The block that takes the height of its week and flows with the page on a phone (section 2 ter). */
const FLOWS_ON_PHONE = "calendar";

async function openScenario(page: Page, scenario: HomeScenario): Promise<unknown[]> {
  await page.clock.setFixedTime(scenario.now);
  await serveFamily(page, {
    children: scenario.children,
    events: scenario.events,
    schoolCalendar: scenario.schoolCalendar,
  });
  const saved = await serveLayout(page, scenario.homeLayout);
  await page.goto("/");
  await expect(page.locator("[data-block=calendar]")).toBeAttached();
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  await settled(page);

  return saved;
}

/** The rows a tile is drawn on, from the size its layout keeps, written `wxh`. */
function rowsOf(block: string, size: string, columns: GridColumns): number {
  const [w, h] = size.split("x").map(Number);
  if (!w || !h) return 1;

  return sizeAt({ w, h }, boundsOf(block), columns).h;
}

/**
 * The blocks whose height is not the one of their size, row steps and the gaps between them,
 * whatever they hold. A home the parent arranged may grow a block to close a cell: there the tile
 * is held to the rows it spans instead.
 */
async function offSize(page: Page, width: number, arranged: boolean): Promise<string[]> {
  const columns = gridColumnsFor(width);
  const measured = await page.locator(READ_GRID).evaluate((grid) => {
    const style = getComputedStyle(grid);

    return {
      row: Number.parseFloat(style.gridAutoRows),
      gap: Number.parseFloat(style.rowGap),
      tiles: [...grid.querySelectorAll<HTMLElement>("[data-block][data-size]")].map((tile) => ({
        block: tile.dataset.block ?? "",
        size: tile.dataset.size ?? "",
        spanned: Number.parseInt(tile.style.getPropertyValue("--h"), 10),
        height: (tile.querySelector("[data-slot=dashboard-panel]") ?? tile).getBoundingClientRect()
          .height,
      })),
    };
  });

  return measured.tiles
    .filter(({ block }) => !(columns === 1 && block === FLOWS_ON_PHONE))
    .flatMap(({ block, size, spanned, height }) => {
      const rows = arranged ? spanned : rowsOf(block, size, columns);
      const expected = rows * measured.row + (rows - 1) * measured.gap;

      return Math.abs(height - expected) > 1
        ? [`${block} (${size}): ${Math.round(height)}px, not ${Math.round(expected)}px`]
        : [];
    });
}

/**
 * The cells of the read grid left free between tiles, or covered twice. A free cell with no tile
 * after it on its row nor under it in its column is the space after the last tile, which a home
 * the parent arranged may end on: not a hole.
 */
async function uncovered(page: Page): Promise<string[]> {
  return page.locator(READ_GRID).evaluate((grid) => {
    const columns = Number.parseInt(grid.style.getPropertyValue("--dashboard-columns"), 10);
    const lineOf = (tile: HTMLElement, name: string) =>
      Number.parseInt(tile.style.getPropertyValue(name), 10);
    const places = [...grid.querySelectorAll<HTMLElement>("[data-slot=dashboard-tile]")].map(
      (tile) => ({
        x: lineOf(tile, "--x") - 1,
        y: lineOf(tile, "--y") - 1,
        w: lineOf(tile, "--w"),
        h: lineOf(tile, "--h"),
      }),
    );
    const rows = Math.max(...places.map(({ y, h }) => y + h));
    const taken = new Map<string, number>();
    for (const { x, y, w, h } of places)
      for (let row = y; row < y + h; row++)
        for (let column = x; column < x + w; column++)
          taken.set(`${row}:${column}`, (taken.get(`${row}:${column}`) ?? 0) + 1);
    const tileAfter = (row: number, column: number) =>
      places.some(
        ({ x, y, w, h }) =>
          (row >= y && row < y + h && x > column) || (column >= x && column < x + w && y > row),
      );

    return Array.from({ length: rows * columns }, (_, cell) => {
      const row = Math.floor(cell / columns);
      const column = cell % columns;
      const count = taken.get(`${row}:${column}`) ?? 0;
      if (count === 1 || (count === 0 && !tileAfter(row, column))) return [];

      return [`row ${row}:${column}: ${count} tiles`];
    }).flat();
  });
}

/**
 * The rendered edges of the tiles that fall on no line of the grid: each left and right on a
 * column's edge, each top and bottom on a row's, measured on the screen rather than read from the
 * places declared, the tracks as the browser sized them (the Agenda flowing on a phone included).
 */
async function offLines(page: Page): Promise<string[]> {
  return page.locator(READ_GRID).evaluate((grid) => {
    const style = getComputedStyle(grid);
    const box = grid.getBoundingClientRect();
    const linesOf = (tracks: string, origin: number, gap: number) => {
      const sizes = tracks.split(" ").map(Number.parseFloat);
      const starts = sizes.map(
        (_, index) => origin + sizes.slice(0, index).reduce((sum, size) => sum + size + gap, 0),
      );

      return { starts, ends: starts.map((start, index) => start + (sizes[index] ?? 0)) };
    };
    const columns = linesOf(
      style.gridTemplateColumns,
      box.left + Number.parseFloat(style.paddingLeft),
      Number.parseFloat(style.columnGap),
    );
    const rows = linesOf(
      style.gridTemplateRows,
      box.top + Number.parseFloat(style.paddingTop),
      Number.parseFloat(style.rowGap),
    );
    const on = (at: number, lines: number[]) => lines.some((line) => Math.abs(at - line) <= 1);

    return [...grid.querySelectorAll<HTMLElement>("[data-block][data-size]")].flatMap((tile) => {
      const edge = (
        tile.querySelector("[data-slot=dashboard-panel]") ?? tile
      ).getBoundingClientRect();
      const off = [
        on(edge.left, columns.starts) ? null : `left ${Math.round(edge.left)}`,
        on(edge.right, columns.ends) ? null : `right ${Math.round(edge.right)}`,
        on(edge.top, rows.starts) ? null : `top ${Math.round(edge.top)}`,
        on(edge.bottom, rows.ends) ? null : `bottom ${Math.round(edge.bottom)}`,
      ].filter((side) => side !== null);

      return off.length > 0 ? [`${tile.dataset.block}: ${off.join(", ")}`] : [];
    });
  });
}

/**
 * The rows of the read grid whose titles do not share their baseline (± 1 px), the hero's
 * included: the baseline is read from an empty inline box set on it inside each title.
 */
async function offBaseline(page: Page): Promise<string[]> {
  return page.locator(READ_GRID).evaluate((grid) => {
    const titles = [...grid.querySelectorAll<HTMLElement>("[data-block][data-size]")].flatMap(
      (tile) => {
        const title = tile.querySelector("[data-slot=dashboard-panel-title]");
        const panel = tile.querySelector("[data-slot=dashboard-panel]") ?? tile;
        if (!title) return [];

        const probe = document.createElement("span");
        probe.style.display = "inline-block";
        title.prepend(probe);
        const baseline = probe.getBoundingClientRect().bottom;
        probe.remove();

        return [
          {
            block: tile.dataset.block ?? "",
            row: Math.round(panel.getBoundingClientRect().top),
            baseline,
          },
        ];
      },
    );
    const rows = Map.groupBy(titles, ({ row }) => row);

    return [...rows.values()].flatMap((row) => {
      const lines = row.map(({ baseline }) => baseline);

      return Math.max(...lines) - Math.min(...lines) > 1
        ? [row.map(({ block, baseline }) => `${block} ${Math.round(baseline)}`).join(", ")]
        : [];
    });
  });
}

function emptyBlocks(page: Page): Promise<string[]> {
  return page
    .locator("[data-block][data-size]:has([data-slot=dashboard-panel-empty])")
    .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-block") ?? ""));
}

/** Tabs from the top of the page until the focus lands in a block, and names that block. */
async function firstBlockTabbedTo(page: Page): Promise<{ block: string; hero: boolean } | null> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });

  for (let tab = 0; tab < MAX_TABS; tab++) {
    await page.keyboard.press("Tab");
    const landed = await page.evaluate(() => {
      const tile = document.activeElement?.closest("[data-block]");

      return tile
        ? {
            block: tile.getAttribute("data-block") ?? "",
            hero: tile.querySelector("[data-hero]") !== null,
          }
        : null;
    });
    if (landed) return landed;
  }

  return null;
}

/**
 * The part of the screen the page shows, the page at its top: the viewport less the chrome fixed
 * over it, the phone's tab bar at the bottom, measured from the page.
 */
async function visibleArea(page: Page, viewport: Viewport): Promise<{ bottom: number }> {
  const chromeTop = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((element) => getComputedStyle(element).position === "fixed")
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.height > 0 && box.bottom >= window.innerHeight - 1)
      .map((box) => box.top),
  );

  return { bottom: Math.min(viewport.height, ...chromeTop) };
}

/** The sides of an element past the edges of what the page shows, the page at its top. */
async function outOfView(page: Page, element: Locator, viewport: Viewport): Promise<string[]> {
  const box = await element.boundingBox();
  if (!box) return ["no box"];

  const { bottom } = await visibleArea(page, viewport);
  const sides = {
    top: box.y < 0,
    left: box.x < 0,
    bottom: box.y + box.height > bottom,
    right: box.x + box.width > viewport.width,
  };

  return Object.entries(sides).flatMap(([side, out]) =>
    out ? [`${side} (${Math.round(box.y + box.height)}px past ${Math.round(bottom)}px)`] : [],
  );
}

/**
 * The Agenda crowned on a phone: it flows with the page at the height of its week (section 2 ter),
 * so the hero in view is its header, its date and its title, the week following under it.
 */
function agendaHeroOnPhone(scenario: HomeScenario, viewport: Viewport): boolean {
  return gridColumnsFor(viewport.width) === 1 && scenario.hero === FLOWS_ON_PHONE;
}

async function expectHeroOfTheMoment(page: Page, scenario: HomeScenario, viewport: Viewport) {
  const heroes = page.locator("[data-hero]");
  if (scenario.hero === null) {
    await expect(heroes).toHaveCount(0);
    return;
  }

  await expect(heroes).toHaveCount(1);
  const hero = page.locator(`[data-block=${scenario.hero}]`);
  await expect(hero.locator("[data-hero]")).toHaveCount(1);
  expect((await domOrder(page))[0]).toBe(scenario.hero);

  const shown = agendaHeroOnPhone(scenario, viewport)
    ? hero.locator("[data-slot=dashboard-panel-header]")
    : heroes;
  expect(await outOfView(page, shown, viewport)).toEqual([]);
  if (agendaHeroOnPhone(scenario, viewport))
    await expect(shown.locator("[data-hero-date]")).toBeVisible();

  expect(await firstBlockTabbedTo(page)).toEqual({ block: scenario.hero, hero: true });
}

/**
 * The Agenda crowned during the holidays opens on the week school starts again, the day its
 * tear-off date shows heading its period, at every width.
 */
async function expectAgendaOnReturnWeek(page: Page, scenario: HomeScenario) {
  if (scenario.hero !== FLOWS_ON_PHONE || scenario.schoolCalendar.holidays.length === 0) return;

  const agenda = page.locator("[data-block=calendar]");
  const day = await agenda.locator("[data-hero-date]:visible [data-part=day]").textContent();
  await expect(agenda).toContainText(`Du ${day} `);
}

/** On a phone the Agenda takes the height of its week, so the page scrolls and the Agenda never does. */
async function expectAgendaFlowsOnPhone(page: Page, viewport: Viewport) {
  if (gridColumnsFor(viewport.width) !== 1) return;

  const agenda = page.getByRole("region", { name: "Agenda" });
  const [scrollHeight, clientHeight] = await agenda.evaluate((region) => [
    region.scrollHeight,
    region.clientHeight,
  ]);
  expect(scrollHeight).toBe(clientHeight);
}

/** The deadlines listed under a Wednesday of the Agenda, whichever week it opens on. */
function wednesdayDeadline(page: Page, title: string): Locator {
  return page
    .locator("[data-block=calendar] [data-slot=calendar-day]")
    .filter({ hasText: /Mercredi \d/ })
    .locator("[data-slot=calendar-entry]")
    .filter({ hasText: title });
}

interface Arrangement {
  order: string[];
  sizes: (string | null)[];
}

function arrangementOf(page: Page): Promise<Arrangement> {
  return page.locator("[data-block][data-size]").evaluateAll((tiles) => ({
    order: tiles.map((tile) => tile.getAttribute("data-block") ?? ""),
    sizes: tiles.map((tile) => tile.getAttribute("data-size")),
  }));
}

/** The tab going to the background and coming back, as a phone does when the parent switches apps. */
function showTab(page: Page, state: "hidden" | "visible"): Promise<void> {
  return page.evaluate((visibility) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

function scenarioNamed(name: string): HomeScenario {
  const scenario = HOME_SCENARIOS.find((candidate) => candidate.name === name);
  if (!scenario) throw new Error(`No home scenario named ${name}.`);

  return scenario;
}

test.describe("the advised home, scenario by scenario", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const scenario of HOME_SCENARIOS)
    for (const viewport of VIEWPORTS)
      test(`${scenario.name}: one hero in view, every block at its size, the same read or arranged (${viewport.width} × ${viewport.height})`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openScenario(page, scenario);

        await expectHeroOfTheMoment(page, scenario, viewport);
        const reading = await cards(page);
        expect(await offSize(page, viewport.width, scenario.homeLayout !== null)).toEqual([]);
        expect(await uncovered(page)).toEqual([]);
        expect(await offLines(page)).toEqual([]);
        expect(await offBaseline(page)).toEqual([]);
        await expect(
          page.locator("[data-slot=dashboard-band], [data-slot=compact-tile]"),
        ).toHaveCount(0);
        await expect(page.locator("[data-block]").getByText(/^Voir les/)).toHaveCount(0);
        await expectAgendaFlowsOnPhone(page, viewport);
        await expectAgendaOnReturnWeek(page, scenario);
        if (scenario.wednesday)
          await expect(wednesdayDeadline(page, scenario.wednesday).first()).toBeAttached();
        const empty = await emptyBlocks(page);

        await arrange(page);
        const arranging = await cards(page);
        expect(Object.keys(arranging).sort()).toEqual(Object.keys(reading).sort());
        expect(apart(reading, arranging)).toEqual([]);
        expect(holes(arranging)).toEqual([]);
        expect(await emptyBlocks(page)).toEqual(empty);
      });

  for (const scenario of HOME_SCENARIOS)
    for (const colorScheme of COLOR_SCHEMES)
      test(`${scenario.name}: passes axe (${colorScheme})`, async ({ page }) => {
        await page.setViewportSize(DESKTOP);
        await showColorScheme(page, colorScheme);
        await openScenario(page, scenario);

        expect(await blockingViolations(page)).toEqual([]);
        await expect(page.locator("main")).toHaveCount(1);
        await expect(page.locator("h1")).toHaveCount(1);
      });
});

/** Where the Agenda's strip of days and its first day sit inside the Agenda, page at its top. */
function agendaInsides(page: Page): Promise<number[]> {
  return page.locator("[data-block=calendar] [data-slot=dashboard-panel]").evaluate((panel) => {
    const top = panel.getBoundingClientRect().top;
    const strip = panel.querySelector("[data-slot=calendar-day-strip]");
    const day = panel.querySelector("[data-slot=calendar-day]");

    return [strip, day].map((element) =>
      element ? Math.round(element.getBoundingClientRect().top - top) : Number.NaN,
    );
  });
}

/** The column days of the Agenda whose note (the "Aujourd'hui" badge) covers their date. */
function coveredDates(page: Page): Promise<string[]> {
  return page
    .locator("[data-block=calendar] [data-slot=calendar-day][data-layout=column]")
    .evaluateAll((days) =>
      days.flatMap((day) => {
        const badge = day.querySelector("[data-slot=calendar-day-note] [data-slot=badge]");
        if (!badge) return [];

        const note = badge.getBoundingClientRect();
        const covered = [
          ...day.querySelectorAll("[data-slot=calendar-day-mark] > [aria-hidden]"),
        ].filter((part) => {
          const box = part.getBoundingClientRect();

          return box.width > 0 && box.right > note.left + 1 && box.left < note.right - 1;
        });

        return covered.length > 0 ? [day.textContent?.slice(0, 24) ?? ""] : [];
      }),
    );
}

test.describe("the Agenda's columns", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const viewport of VIEWPORTS.filter(({ width }) => width >= 768))
    test(`keep each date clear of its badge (${viewport.width} px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openScenario(page, scenarioNamed("morning-two-children"));

      await expect(
        page.locator("[data-block=calendar] [data-slot=calendar-day][data-layout=column]").first(),
      ).toBeVisible();
      expect(await coveredDates(page)).toEqual([]);
    });
});

/**
 * How far the Agenda's sticky strip of days and day dates sit from where they would lie unstuck,
 * the page and the Agenda at their top: anything but 0 is a stick resolved against the wrong
 * scroller, a gap under the toolbar or a date over a deadline.
 */
function stuckOffsets(page: Page): Promise<number[]> {
  return page.locator("[data-block=calendar]").evaluate((agenda) => {
    window.scrollTo(0, 0);
    for (const region of agenda.querySelectorAll("[data-slot=scroll-region]")) region.scrollTop = 0;

    return [
      ...agenda.querySelectorAll<HTMLElement>(
        "[data-slot=calendar-day-strip], [data-layout=rail] > [data-slot=calendar-day-mark]",
      ),
    ].map((element) => {
      const stuck = element.getBoundingClientRect().top;
      element.style.position = "static";
      const unstuck = element.getBoundingClientRect().top;
      element.style.position = "";

      return Math.round(stuck - unstuck);
    });
  });
}

test.describe("the Agenda's strip of days", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const viewport of VIEWPORTS)
    test(`sits where it lies, page and Agenda at their top (${viewport.width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openScenario(page, scenarioNamed("holidays"));

      expect((await stuckOffsets(page)).filter((offset) => offset !== 0)).toEqual([]);
    });
});

test.describe("the Agenda on a phone, arranged", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  test("keeps its strip of days where it is read, above its first day", async ({ page }) => {
    await openScenario(page, scenarioNamed("morning-two-children"));
    const reading = await agendaInsides(page);

    await arrange(page);
    await page.evaluate(() => window.scrollTo(0, 0));

    expect(await agendaInsides(page)).toEqual(reading);
  });
});

test.describe("a home the parent arranged", () => {
  test.use({ storageState: STORAGE_STATE, viewport: DESKTOP });

  test("stays as arranged from morning to evening, and going back to the advice crowns the hero of the moment", async ({
    page,
  }) => {
    const scenario = scenarioNamed("arranged");
    await page.clock.install({ time: scenario.now });
    const saved = await openScenario(page, scenario);
    const morning = await arrangementOf(page);
    const morningCards = await cards(page);
    await expect(page.locator("[data-hero]")).toHaveCount(0);

    await page.clock.setFixedTime(todayAt("20:00"));
    await page.clock.runFor(2 * 60_000);
    await expect(page.locator("h1")).toHaveText(/^Bonsoir/);
    expect(await arrangementOf(page)).toEqual(morning);
    expect(apart(morningCards, await cards(page))).toEqual([]);
    await expect(page.locator("[data-hero]")).toHaveCount(0);

    await showTab(page, "hidden");
    await page.clock.setFixedTime(todayAt("21:05"));
    await showTab(page, "visible");
    expect(await arrangementOf(page)).toEqual(morning);
    await expect(page.locator("[data-hero]")).toHaveCount(0);

    await arrange(page);
    await page.getByRole("button", { name: "Revenir à la disposition conseillée" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revenir à la disposition conseillée" })
      .click();
    await expect
      .poll(() => saved.at(-1))
      .toEqual({ v: 3, blocks: null, baseRevision: expect.any(Number) });
    await finish(page);

    await expect(page.locator("[data-hero]")).toHaveCount(1);
    await expect(page.locator("[data-block=tonight] [data-hero]")).toHaveCount(1);
    expect((await domOrder(page))[0]).toBe("tonight");
  });
});
