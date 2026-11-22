import type { Page } from "@playwright/test";
import { expect } from "./csp";
import { type Block, inCases } from "./served-layout";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A home the parent arranged: one block of each size, the Agenda among them. */
export const ARRANGED: Block[] = [
  { id: "today", size: { w: 2, h: 2 } },
  { id: "tonight", size: { w: 2, h: 1 } },
  { id: "review", size: { w: 1, h: 1 } },
  { id: "overdue", size: { w: 1, h: 1 } },
  { id: "calendar", size: { w: 4, h: 2 } },
  { id: "assessments", size: { w: 2, h: 1 } },
  { id: "documents", size: { w: 2, h: 1 } },
  { id: "notes", size: { w: 2, h: 1 } },
];

/**
 * The home layout served with a revision, every save kept and answered with the next revision, so
 * a reset (`{ blocks: null }`) is read back as the advised home. Returns the saves, in order.
 */
export async function serveLayout(
  page: Page,
  blocks: Block[] | null = ARRANGED,
): Promise<unknown[]> {
  const saved: unknown[] = [];
  let layout: unknown = inCases(blocks);
  let revision = 1;

  await page.route(
    (url) => url.pathname === "/home/layout",
    async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        const body: { blocks: unknown } = request.postDataJSON();
        saved.push(body);
        layout = body.blocks;
        revision += 1;
      }

      return route.fulfill({ json: { v: 3, blocks: layout, revision } });
    },
  );

  return saved;
}

/** Enters the arranged home and waits until its tiles stopped moving. */
export async function arrange(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Modifier l'accueil" }).click();
  await expect(page.locator(".react-grid-layout")).toBeVisible();
  await settled(page);
}

/** Leaves the arranged home. */
export async function finish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Terminé" }).click();
  await expect(page.locator(".react-grid-layout")).toHaveCount(0);
}

/**
 * Waits until no finite animation driven by time is running: a rectangle read mid-move is not the
 * tile's. A looping one (the progress of a first reading) never ends, so it is left out.
 */
export function settled(page: Page): Promise<void> {
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

/** The card of each block, from the corner of the grid that holds it, in reading order. */
export async function cards(page: Page): Promise<Record<string, Rect>> {
  await settled(page);
  const grid = page.locator(".react-grid-layout, [data-slot=dashboard]:not([aria-hidden])").first();

  return grid.evaluate((el) => {
    const origin = el.getBoundingClientRect();
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-block][data-size]")];

    return Object.fromEntries(
      tiles.map((tile) => {
        const box = (
          tile.querySelector("[data-slot=dashboard-panel]") ?? tile
        ).getBoundingClientRect();

        return [
          tile.dataset.block ?? "",
          { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height },
        ];
      }),
    );
  });
}

/** The blocks whose rectangle moved by more than 1 px between two readings, and the sides that did. */
export function apart(reading: Record<string, Rect>, arranging: Record<string, Rect>): string[] {
  return Object.entries(reading).flatMap(([block, rect]) => {
    const other = arranging[block];
    const sides = (["x", "y", "width", "height"] as const).filter(
      (side) => !other || Math.abs(other[side] - rect[side]) > 1,
    );

    return sides.length > 0 ? [`${block}: ${sides.join(", ")}`] : [];
  });
}

/** Every pair of horizontal neighbours and every column meets with one gap, never a hole. */
export function holes(rects: Record<string, Rect>): string[] {
  const boxes = Object.entries(rects);

  return boxes.flatMap(([block, box]) => {
    const below = boxes.filter(
      ([, other]) =>
        other.y >= box.y + box.height - 1 &&
        other.x < box.x + box.width - 1 &&
        other.x + other.width > box.x + 1,
    );
    if (below.length === 0) return [];

    const gap = Math.min(...below.map(([, other]) => other.y)) - (box.y + box.height);

    return gap > 24 ? [`${block} ${Math.round(gap)}px`] : [];
  });
}

/** The blocks of the home in the order of the DOM, which is the order of reading and of Tab. */
export function domOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-block][data-size]")
    .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute("data-block") ?? ""));
}
