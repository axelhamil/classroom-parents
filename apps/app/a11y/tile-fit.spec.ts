import type { Page } from "@playwright/test";
import { HOME_BLOCK_SIZES } from "../src/features/events/home-block-sizes";
import { expect, test } from "./csp";
import {
  EVENTS,
  inDays,
  LEA,
  MAXIMILIEN,
  REVIEW_EVENT,
  serveFamily,
  todayAt,
} from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const SIZES = ["s", "m", "l", "xl"] as const;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

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

function layoutAt(size: (typeof SIZES)[number]) {
  return Object.entries(HOME_BLOCK_SIZES)
    .filter(([, sizes]) => sizes.allowed.includes(size))
    .map(([id]) => ({ id: id.replace("*", LEA.id), size }));
}

interface TileOffender {
  block: string;
  scrollers: number;
  smallest: number;
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

function settled(page: Page): Promise<void> {
  return expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running" ||
              animation.timeline !== document.timeline ||
              animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
          ),
      ),
    )
    .toBe(true);
}

test.describe("each home tile scrolls once, and never through a slit", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const viewport of VIEWPORTS)
    for (const size of SIZES)
      test(`every block at ${size.toUpperCase()}, ${viewport.width} px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.clock.setFixedTime(todayAt("17:00"));
        await serveFamily(page, {
          children: [LEA, MAXIMILIEN],
          events: FULL_WEEK,
          homeLayout: layoutAt(size),
        });
        const loaded = page.waitForResponse((response) =>
          new URL(response.url()).pathname.startsWith("/events"),
        );
        await page.goto("/");
        await loaded;
        await expect(page.locator("[data-block]").first()).toBeVisible();
        await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
        await settled(page);

        expect(await tileOffenders(page)).toEqual([]);
      });
});
