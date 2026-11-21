import type { Locator, Page } from "@playwright/test";
import { wordlessCategories } from "./agenda-board";
import { clippingFrames, drawnWithin } from "./clipping";
import { expect, test } from "./csp";
import {
  BUSY_WEEK,
  EVENTS,
  inDays,
  LEA,
  MAXIMILIEN,
  parisTime,
  REVIEW_EVENT,
  serveFamily,
  todayAt,
} from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";
import type { Block } from "./served-layout";

/**
 * The narrowest computer width, where the Agenda takes a whole row of 3 columns on 2 rows and its
 * week scrolls inside: below it, on 2 columns, the Agenda is 3 rows high and a busy week fits.
 */
const TILE_VIEWPORT = { width: 1280, height: 900 };

test.use({ storageState: STORAGE_STATE, viewport: TILE_VIEWPORT });

async function openAgenda(
  page: Page,
  events: readonly unknown[],
  homeLayout?: Block[],
): Promise<Locator> {
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: [...events], homeLayout });
  await page.goto("/");
  const agenda = page.getByRole("region", { name: "Agenda" });
  await expect(agenda.locator("[data-slot=calendar-entry-link]").first()).toBeVisible();

  return agenda;
}

function scrollAreaOf(agenda: Locator): Locator {
  return agenda.locator("[data-slot=scroll-region]");
}

/** Whether `inner` is drawn whole inside the box of `outer`, a pixel of rounding aside. */
async function inside(inner: Locator, outer: Locator): Promise<boolean> {
  const [box, frame] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
  if (!box || !frame) return false;

  return (
    box.y >= frame.y - 1 &&
    box.y + box.height <= frame.y + frame.height + 1 &&
    box.x >= frame.x - 1 &&
    box.x + box.width <= frame.x + frame.width + 1
  );
}

/** Whether a control is drawn whole in the part of the tile the parent sees, not clipped by its scroll. */
async function inSight(control: Locator, agenda: Locator): Promise<boolean> {
  const [nearest] = await clippingFrames(control);
  const box = await control.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect();

    return { top, bottom };
  });
  const clipped = nearest !== undefined && !drawnWithin(box, nearest);

  return !clipped && (await inside(control, agenda));
}

test.describe("the Agenda tile on load", () => {
  for (const width of [768, 1277, 1440])
    test(`shows its toolbar without a gesture, after the jump to today (${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const agenda = await openAgenda(page, BUSY_WEEK);
      await expect(agenda.locator("[aria-current=date]").first()).toBeVisible();

      const week = agenda.getByRole("tab", { name: "Semaine" });
      const add = agenda.getByRole("button", { name: "Ajouter" });
      await expect.poll(() => inSight(week, agenda)).toBe(true);
      await expect.poll(() => inSight(add, agenda)).toBe(true);
    });

  test("opens a medium tile on its toolbar, the whole body scrolling once", async ({ page }) => {
    const agenda = await openAgenda(page, BUSY_WEEK, [{ id: "calendar", size: { w: 2, h: 1 } }]);

    await expect
      .poll(() => inSight(agenda.getByRole("tab", { name: "Semaine" }), agenda))
      .toBe(true);
    await expect
      .poll(() => inSight(agenda.getByRole("button", { name: "Ajouter" }), agenda))
      .toBe(true);
  });
});

test.describe("the Agenda tile", () => {
  test("does not scroll when the week fits", async ({ page }) => {
    const area = scrollAreaOf(await openAgenda(page, EVENTS));

    const [scrollHeight, clientHeight] = await area.evaluate((element) => [
      element.scrollHeight,
      element.clientHeight,
    ]);
    expect(scrollHeight).toBe(clientHeight);
  });

  // One scroll for the whole planner keeps the seven columns side by side on one line of time;
  // the dates stick to its top, and the weekend keeps its label above the day being read.
  test("keeps its toolbar and the dates of the week in sight after scrolling to the end", async ({
    page,
  }) => {
    const agenda = await openAgenda(page, BUSY_WEEK);
    const area = scrollAreaOf(agenda);
    expect(await area.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );

    await area.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => area.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

    const toolbar = agenda.getByRole("tablist", { name: "Vue des échéances" });
    expect(await inside(toolbar, agenda)).toBe(true);
    expect(
      await toolbar.evaluate(
        (element, region) => !region?.contains(element),
        await area.elementHandle(),
      ),
    ).toBe(true);
    const board = agenda.locator("[data-arrangement=board]");
    const schoolDays = board.locator(
      ":scope > [data-slot=calendar-day] [data-slot=calendar-day-mark]",
    );
    await expect(schoolDays).toHaveCount(5);
    for (const date of await schoolDays.all()) expect(await inside(date, area)).toBe(true);
    const weekend = board.locator(":scope > [data-slot=calendar-weekend]");
    expect(await inside(weekend.locator("[data-part=label]"), area)).toBe(true);
    const sunday = weekend.locator("[data-slot=calendar-day-mark]").last();
    expect(await inside(sunday, area)).toBe(true);
  });

  test("keeps the gesture inside only while it can still scroll both ways", async ({ page }) => {
    const area = scrollAreaOf(await openAgenda(page, BUSY_WEEK));
    const contained = () => area.evaluate((element) => element.hasAttribute("data-contained"));

    expect(await contained()).toBe(false);
    await area.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });
    await expect.poll(contained).toBe(true);
    await area.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(contained).toBe(false);
  });

  test("folds the empty days to their date and gives their width to the loaded ones", async ({
    page,
  }) => {
    const agenda = await openAgenda(page, EVENTS);
    const board = agenda.locator("[data-arrangement=board]");
    const today = board.locator("[data-slot=calendar-day][aria-current=date]");
    const folded = board.locator("[data-slot=calendar-day][data-folded]");

    await expect(today).not.toHaveAttribute("data-folded");
    expect(await folded.count()).toBeGreaterThan(0);
    const [foldedBox, todayBox] = await Promise.all([
      folded.first().boundingBox(),
      today.boundingBox(),
    ]);
    expect((foldedBox?.width ?? 0) * 3).toBeLessThan(todayBox?.width ?? 0);
  });
});

/**
 * What spills out of a planner's column: a descendant wider than its own box or than the column.
 * Left out: a checkbox, whose overflow is the invisible 44 px target drawn around it, what is
 * only read (a visually hidden word, one pixel wide), and a name that gives way on purpose, cut by
 * an ellipsis with its full text in its `title`.
 */
function spills(board: Locator): Promise<string[]> {
  return board.evaluate((element) =>
    [...element.children].flatMap((column) => {
      const edge = column.getBoundingClientRect();
      const label = column.getAttribute("data-jump") ?? column.getAttribute("data-slot") ?? "";

      const ellipsed = (inner: Element): boolean =>
        getComputedStyle(inner).textOverflow === "ellipsis" && inner.hasAttribute("title");

      const readOnly = (inner: Element): boolean => {
        for (let node: Element | null = inner; node && node !== column; node = node.parentElement)
          if (node.getBoundingClientRect().width <= 1) return true;

        return false;
      };

      return [column, ...column.querySelectorAll<HTMLElement>("*")]
        .filter(
          (inner) =>
            inner.clientWidth > 0 &&
            !readOnly(inner) &&
            !ellipsed(inner) &&
            inner.getAttribute("data-slot") !== "checkbox",
        )
        .filter((inner) => {
          const box = inner.getBoundingClientRect();

          return (
            inner.scrollWidth > inner.clientWidth + 1 ||
            box.left < edge.left - 1 ||
            box.right > edge.right + 1
          );
        })
        .map((inner) => `${label}: ${inner.textContent?.trim().slice(0, 20)}`);
    }),
  );
}

/** The day after today is a Friday whose weekend holds nothing: Saturday says "Demain". */
const FRIDAY = inDays(1);
const FRIDAY_ONLY = [
  {
    ...REVIEW_EVENT,
    status: "confirmed",
    deadlineDate: FRIDAY,
    deadlineAt: `${FRIDAY}T07:00:00.000Z`,
  },
];

test.describe("the planner's columns", () => {
  for (const width of [768, 993, 1280, 1440]) {
    test(`hold everything they show, folded or not (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const agenda = await openAgenda(page, EVENTS);

      const board = agenda.locator("[data-arrangement=board]");

      expect(await spills(board)).toEqual([]);
      expect(await wordlessCategories(board)).toEqual([]);
    });

    test(`keep the weekend open when Saturday is tomorrow (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(parisTime(FRIDAY, "09:00"));
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: FRIDAY_ONLY });
      await page.goto("/");
      const board = page
        .getByRole("region", { name: "Agenda" })
        .locator("[data-arrangement=board]");
      await expect(board.locator("[data-slot=calendar-entry-link]").first()).toBeVisible();

      expect(await spills(board)).toEqual([]);
      const weekend = page.getByRole("group", { name: "Week-end" });
      await expect(weekend).not.toHaveAttribute("data-folded");
      await expect(weekend.getByText("Demain", { exact: true })).toBeVisible();
    });

    test(`fold a quiet weekend whole to its dates (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const agenda = await openAgenda(page, FRIDAY_ONLY);
      const board = agenda.locator("[data-arrangement=board]");

      expect(await spills(board)).toEqual([]);
      const weekend = page.getByRole("group", { name: "Week-end" });
      await expect(weekend).toHaveAttribute("data-folded", "true");
      await expect(board.locator("[data-folded] [data-slot=calendar-day-note]")).toHaveCount(0);
    });
  }
});
