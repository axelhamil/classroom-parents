import type { Page } from "@playwright/test";
import {
  ADVICE_ONLY_BLOCK_IDS,
  boundsOf,
  HOME_BLOCK_PATTERNS,
} from "../src/features/events/home-block-bounds";
import {
  type BlockSize,
  type Bounds,
  boundsAt,
  type GridColumns,
} from "../src/shared/dashboard/block-size";
import { withoutPinned } from "../src/shared/dashboard/layout-commands";
import { gridColumnsFor } from "../src/shared/dashboard/use-grid-columns";
import { expect, test } from "./csp";
import {
  EVENTS,
  inDays,
  LEA,
  MAXIMILIEN,
  NEWCOMER,
  REVIEW_EVENT,
  serveFamily,
  todayAt,
} from "./events-fixtures";
import { apart, arrange, cards, settled } from "./home-board";
import { STORAGE_STATE } from "./playwright.config";

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1600, height: 900 },
].map((viewport) => ({ ...viewport, columns: gridColumnsFor(viewport.width) }));

const SIZINGS = ["smallest", "middle", "largest"] as const;

type Sizing = (typeof SIZINGS)[number];

const SMALLEST_SCROLL_HEIGHT = 64;

function event(index: number, days: number, fields: object) {
  return {
    ...REVIEW_EVENT,
    id: `5e6f7a8b-9c0d-4e1f-8a2b-${String(index).padStart(12, "0")}`,
    status: "confirmed",
    deadlineDate: inDays(days),
    deadlineAt: `${inDays(days)}T07:00:00.000Z`,
    ...fields,
  };
}

/** Enough of every kind that each block has more to show than its smallest tile holds. */
const FULL_WEEK = [
  ...EVENTS,
  ...[2, 4, 5, 6].map((days, index) =>
    event(index, days, { status: "needs_review", title: `Date à vérifier ${index + 1}` }),
  ),
  ...[-1, -2, -3].map((days, index) =>
    event(10 + index, days, { category: "homework", title: `Devoir en retard ${index + 1}` }),
  ),
  ...[1, 4, 8].map((days, index) =>
    event(20 + index, days, { category: "assessment", title: `Contrôle ${index + 1}` }),
  ),
  ...[1, 5].map((days, index) =>
    event(30 + index, days, {
      category: "document_due",
      title: `Autorisation ${index + 1}`,
      childId: MAXIMILIEN.id,
    }),
  ),
  ...[0, 1, 2].map((days, index) =>
    event(40 + index, days, { category: "homework", title: `Exercices ${index + 1}` }),
  ),
];

const LONG_NAMED = {
  ...LEA,
  label: "Marie-Charlotte-Éléonore de La Tour d'Auvergne-Montmorency-Laval",
};

/** Every deadline of the week, the first of each kind under an unbreakable title for its child. */
const LONG_TITLES = FULL_WEEK.map((event) => ({
  ...event,
  childId: LONG_NAMED.id,
  title: `Autorisationdesortieauchâteaudeversaillesàrendresignéeparlesdeuxparents ${event.title}`,
}));

/** Every block the parent can place, each at its smallest, middle or largest size at these columns. */
function layoutAt(sizing: Sizing, columns: GridColumns, childId = LEA.id) {
  return withoutPinned(HOME_BLOCK_PATTERNS, ADVICE_ONLY_BLOCK_IDS).flatMap((pattern) => {
    const id = pattern.replace("*", childId);
    const block = boundsOf(id);
    if (!block) return [];

    return [{ id, ...sizeAt(sizing, boundsAt(block, columns)) }];
  });
}

function sizeAt(sizing: Sizing, { minW, maxW, minH, maxH }: Bounds): BlockSize {
  if (sizing === "smallest") return { w: minW, h: minH };
  if (sizing === "largest") return { w: maxW, h: maxH };

  return { w: Math.round((minW + maxW) / 2), h: Math.round((minH + maxH) / 2) };
}

/** The home served in cases as the server keeps it, in place of the fixture's layout. */
async function serveCases(page: Page, blocks: ReturnType<typeof layoutAt>): Promise<void> {
  await page.route(
    (url) => url.pathname === "/home/layout",
    (route) => route.fulfill({ json: { v: 3, blocks, revision: 0 } }),
  );
}

interface TileOffender {
  block: string;
  scrollers: number;
  smallest: number;
}

/**
 * The blocks with something drawn past their tile, outside the one region that scrolls inside it.
 * A line a clamp hides on purpose is let off only downwards: the clamped box itself must stay in
 * the tile, and nothing may run past its sides, a long word included. A part moved by a transform
 * (the fill of a progress bar) is drawing, not content.
 */
function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const underClamp = (element: Element) => {
      for (let node = element.parentElement; node; node = node.parentElement)
        if (getComputedStyle(node).webkitLineClamp !== "none") return true;

      return false;
    };

    return [
      ...document.querySelectorAll<HTMLElement>("[data-slot=dashboard] [data-block]"),
    ].flatMap((tile) => {
      const frame = tile.getBoundingClientRect();
      const past = [...tile.querySelectorAll<HTMLElement>("*")].filter((element) => {
        if (element.closest("[data-slot=scroll-region]")) return false;
        if (element.getClientRects().length === 0) return false;
        if (getComputedStyle(element).transform !== "none") return false;

        const box = element.getBoundingClientRect();
        if (box.right > frame.right + 1 || box.left < frame.left - 1) return true;

        return !underClamp(element) && box.bottom > frame.bottom + 1;
      });

      return past.length > 0 ? [tile.dataset.block ?? ""] : [];
    });
  });
}

/** The tiles drawn as a glance that still list rows or scroll: a full list squashed into one case. */
function squashedGlances(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-block][data-content=glance]")].flatMap(
      (tile) => {
        const scrolls = [...tile.querySelectorAll("*")].some((element) => {
          const { overflowY } = getComputedStyle(element);

          return overflowY === "auto" || overflowY === "scroll";
        });
        const lists = tile.querySelector("li, tr, [data-slot=scroll-region]") !== null;

        return scrolls || lists ? [tile.dataset.block ?? ""] : [];
      },
    ),
  );
}

/** Per block: how many visible scroll containers it holds, and the height of the smallest. */
function tileOffenders(page: Page): Promise<TileOffender[]> {
  return page.evaluate((least) => {
    const scrolls = (element: Element) => {
      const { overflowY, display } = getComputedStyle(element);

      return display !== "none" && (overflowY === "auto" || overflowY === "scroll");
    };
    const shown = (element: Element) => element.getClientRects().length > 0;

    return [...document.querySelectorAll<HTMLElement>("[data-block]")].flatMap((block) => {
      const scrollers = [block, ...block.querySelectorAll("*")].filter(
        (element) => scrolls(element) && shown(element),
      );
      const smallest = Math.min(
        ...scrollers.map((element) => element.clientHeight),
        Number.POSITIVE_INFINITY,
      );
      if (scrollers.length <= 1 && smallest >= least) return [];

      return [{ block: block.dataset.block ?? "", scrollers: scrollers.length, smallest }];
    });
  }, SMALLEST_SCROLL_HEIGHT);
}

async function openHome(page: Page): Promise<void> {
  const loaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/events"),
  );
  await page.goto("/");
  await loaded;
  await expect(page.locator("[data-block]").first()).toBeVisible();
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
  await settled(page);
}

test.describe("each home tile scrolls once, and never through a slit", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const viewport of VIEWPORTS)
    for (const sizing of SIZINGS)
      test(`every block at its ${sizing} size, ${viewport.width} px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.clock.setFixedTime(todayAt("17:00"));
        await serveFamily(page, { children: [LEA, MAXIMILIEN], events: FULL_WEEK });
        await serveCases(page, layoutAt(sizing, viewport.columns));
        await openHome(page);

        expect(await tileOffenders(page)).toEqual([]);
        expect(await squashedGlances(page)).toEqual([]);
        if (sizing === "smallest") expect(await overflowing(page)).toEqual([]);

        const reading = await cards(page);
        await arrange(page);
        expect(apart(reading, await cards(page))).toEqual([]);
      });

  for (const viewport of VIEWPORTS.slice(0, 2))
    test(`a glance keeps a very long name and title in its tile, ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(todayAt("17:00"));
      await serveFamily(page, { children: [LONG_NAMED, MAXIMILIEN], events: LONG_TITLES });
      await serveCases(page, layoutAt("smallest", viewport.columns, LONG_NAMED.id));
      await openHome(page);

      await expect(page.locator("[data-block][data-content=glance]").first()).toBeVisible();
      expect(await overflowing(page)).toEqual([]);
      expect(await squashedGlances(page)).toEqual([]);
    });

  for (const viewport of VIEWPORTS)
    test(`the first steps the advice leads a new parent with, ${viewport.width} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.clock.setFixedTime(todayAt("08:00"));
      await serveFamily(page, { children: [NEWCOMER], events: [] });
      await openHome(page);

      const welcome = page.locator("[data-block=welcome]");
      await expect(welcome).toHaveAttribute("data-size", viewport.columns === 1 ? "1x2" : "2x2");
      await expect(welcome.getByRole("listitem")).toHaveCount(3);
      expect(await tileOffenders(page)).toEqual([]);
    });
});
