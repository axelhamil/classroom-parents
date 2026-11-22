import { blockingViolations, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { EVENTS, inDays, LEA, MAXIMILIEN, serveFamily, todayAt } from "./events-fixtures";
import {
  ARRANGED,
  apart,
  arrange,
  cards,
  domOrder,
  finish,
  holes,
  type Rect,
  serveLayout,
  settled,
} from "./home-board";
import { STORAGE_STATE } from "./playwright.config";
import { type Block, inCases } from "./served-layout";

const WIDTHS = [390, 768, 1440, 1600] as const;

const PHONE = { width: 390, height: 844 };

const WIDE = { width: 1600, height: 900 };

const QUIET_EVENTS = EVENTS.filter((event) => event.deadlineDate !== inDays(1));

async function openHome(page: Page, blocks: Block[] | null = ARRANGED): Promise<unknown[]> {
  await page.clock.setFixedTime(todayAt("18:30"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: QUIET_EVENTS });
  const saved = await serveLayout(page, blocks);
  await page.goto("/");
  await expect(page.locator("[data-block=calendar]")).toBeVisible();
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  return saved;
}

function announcement(page: Page): Locator {
  return page.locator("main p[role=status].sr-only");
}

function tile(page: Page, block: string): Locator {
  return page.locator(`[data-block=${block}][data-size]`);
}

function edge(page: Page, block: string, side: string): Locator {
  return tile(page, block).locator(`.react-resizable-handle-${side}`);
}

/** The blocks as a reader meets them: row by row, left to right. */
function inReadingOrder(rects: Record<string, Rect>): string[] {
  return Object.entries(rects)
    .sort(([, a], [, b]) => a.y - b.y || a.x - b.x)
    .map(([block]) => block);
}

/** Pulls a resize handle with the mouse by a distance, in small steps like a hand. */
async function pullWithMouse(page: Page, grip: Locator, by: { x: number; y: number }) {
  const from = await centerOf(grip);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 12 });
  await page.mouse.up();
}

/** One case of the grid, across and down, read from a tile and the size it is drawn at. */
async function caseOf(page: Page, block: string, cases: { w: number; h: number }) {
  const box = await tile(page, block).boundingBox();
  if (!box) throw new Error("The tile has no box.");

  return { x: box.width / cases.w, y: box.height / cases.h };
}

function handle(page: Page, block: string): Locator {
  return page.getByRole("button", { name: `Déplacer ${block}`, exact: true });
}

/** Where a finger grabs a tile: the title of its toolbar, clear of the buttons that refuse a drag. */
function gripOf(page: Page, block: string): Locator {
  return page.locator(
    `[data-block=${block}] [data-slot=dashboard-tile-toolbar] [data-slot=dashboard-panel-title]`,
  );
}

/** The middle of an element brought on screen, where a finger can reach it. */
async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element has no box.");

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe("the home keeps its rectangles", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const width of WIDTHS)
    test(`draws every block at the same place and size read or arranged, with no hole, in reading order (${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openHome(page);
      const reading = await cards(page);

      const read = await domOrder(page);
      expect(read).toEqual(inReadingOrder(reading));

      await arrange(page);
      const arranging = await cards(page);
      expect(Object.keys(arranging).sort()).toEqual(Object.keys(reading).sort());
      expect(apart(reading, arranging)).toEqual([]);
      expect(holes(arranging)).toEqual([]);
      expect(await domOrder(page)).toEqual(read);

      await finish(page);
      const back = await cards(page);
      expect(apart(reading, back)).toEqual([]);
      expect(holes(back)).toEqual([]);
      expect(await domOrder(page)).toEqual(read);
    });

  for (const colorScheme of COLOR_SCHEMES)
    test(`passes axe while the home is being arranged (${colorScheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await showColorScheme(page, colorScheme);
      await openHome(page);
      await arrange(page);

      expect(await blockingViolations(page)).toEqual([]);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
    });
});

test.describe("the home arranged from the keyboard", () => {
  test.use({ storageState: STORAGE_STATE, viewport: WIDE });

  test("takes, moves, resizes and lays a block with its handle, the focus kept and every step said", async ({
    page,
  }) => {
    const saved = await openHome(page);
    await arrange(page);

    const tonight = handle(page, "Pour ce soir");
    await tabTo(page, tonight);
    await expect(tonight).toHaveAttribute("aria-roledescription", "bloc déplaçable");
    await page.keyboard.press("Space");
    await expect(tonight).toHaveAttribute("aria-pressed", "true");
    await expect(announcement(page)).toHaveText(
      "Pour ce soir, position 2 sur 8, largeur 2, hauteur 1",
    );

    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() => domOrder(page))
      .toEqual(["tonight", "today", ...ARRANGED.slice(2).map(({ id }) => id)]);
    await expect(tonight).toBeFocused();
    await expect(announcement(page)).toHaveText(
      "Pour ce soir, position 1 sur 8, largeur 2, hauteur 1",
    );

    await page.keyboard.press("Shift+ArrowDown");
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x2");
    await expect(announcement(page)).toHaveText("Hauteur 2 sur 3");

    await page.keyboard.press("+");
    await expect(announcement(page)).toHaveText("Largeur 2, la plus grande possible");
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x2");

    await page.keyboard.press("Shift+ArrowLeft");
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "1x2");
    await expect(announcement(page)).toHaveText("Largeur 1 sur 2");
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowUp");
    await page.keyboard.press("Shift+ArrowDown");
    await expect(announcement(page)).toHaveText("Hauteur 2 sur 3");
    expect(holes(await cards(page))).toEqual([]);

    await page.keyboard.press("Space");
    await expect(announcement(page)).toHaveText("Posé");
    await expect(tonight).toBeFocused();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      v: 3,
      blocks: inCases([
        { id: "tonight", size: { w: 2, h: 2 } },
        { id: "today", size: { w: 2, h: 2 } },
        ...ARRANGED.slice(2),
      ]),
    });

    await page.keyboard.press("Space");
    await page.keyboard.press("End");
    await expect.poll(async () => (await domOrder(page)).at(-1)).toBe("tonight");
    await page.keyboard.press("Escape");
    await expect.poll(async () => (await domOrder(page))[0]).toBe("tonight");
    await expect(announcement(page)).toHaveText("Annulé, retour en position 1");
    await expect(page.locator(".react-grid-layout")).toBeVisible();
    await expect(tonight).toBeFocused();
  });

  test("resizes, moves and hides a block from its menu alone, then adds it back and resets the home", async ({
    page,
  }) => {
    const saved = await openHome(page);
    await arrange(page);

    await page.getByRole("button", { name: "Disposition de Pense-bête" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Taille : 2 × 1")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Raccourcir" })).toBeDisabled();
    await expect(menu.getByRole("menuitem", { name: "Élargir" })).toBeDisabled();
    await menu.getByRole("menuitem", { name: "Grandir" }).click();
    await expect(tile(page, "notes")).toHaveAttribute("data-size", "2x2");
    await expect(menu.getByText("Taille : 2 × 2")).toBeVisible();
    await expect(announcement(page)).toHaveText("Hauteur 2 sur 3");
    await expect(menu.getByRole("menuitem", { name: "Rétrécir" })).toBeDisabled();
    await menu.getByRole("menuitem", { name: "Raccourcir" }).click();
    await expect(tile(page, "notes")).toHaveAttribute("data-size", "2x1");
    await expect(announcement(page)).toHaveText("Hauteur 1 sur 3");
    await page.keyboard.press("Escape");
    expect(holes(await cards(page))).toEqual([]);

    await page.getByRole("button", { name: "Disposition de Pense-bête" }).click();
    await page.getByRole("menuitem", { name: "Masquer Pense-bête" }).click();
    await expect(page.locator("[data-block=notes]")).toHaveCount(0);
    const add = page.getByRole("button", { name: "Ajouter un bloc" });
    await expect(add).toBeFocused();

    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Ajouter un bloc" });
    await tabTo(page, drawer.getByRole("button", { name: "Ajouter Pense-bête" }));
    await page.keyboard.press("Enter");
    await expect(drawer).toBeHidden();
    await expect.poll(async () => (await domOrder(page)).at(-1)).toBe("notes");

    await page.getByRole("button", { name: "Revenir à la disposition conseillée" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Revenir à la disposition conseillée" })
      .click();
    await expect
      .poll(() => saved.at(-1))
      .toEqual({ v: 3, blocks: null, baseRevision: expect.any(Number) });
  });

  test("opens the menu of a block with a right click on its header while the home is read", async ({
    page,
  }) => {
    const saved = await openHome(page);
    const header = page.locator("[data-block=review] [data-slot=dashboard-panel-header]");

    await header.click({ button: "right" });
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Modifier l'accueil" })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Taille" }).hover();
    await expect(page.getByText("Taille : 1 × 1")).toBeVisible();
    await page.getByRole("menuitem", { name: "Élargir" }).click();

    await expect(tile(page, "review")).toHaveAttribute("data-size", "2x1");
    await expect(page.locator(".react-grid-layout")).toHaveCount(0);
    await expect.poll(() => saved.length).toBe(1);
  });
});

test.describe("a block the grid draws past its bound to leave no hole", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  const GROWN: Block[] = [
    { id: "calendar", size: { w: 4, h: 2 } },
    { id: "tonight", size: { w: 2, h: 1 } },
    { id: "notes", size: { w: 2, h: 1 } },
  ];

  test("offers and says the size it is drawn at, never a step past its bound", async ({ page }) => {
    const saved = await openHome(page, GROWN);
    await arrange(page);

    await page.getByRole("button", { name: "Disposition de Pour ce soir" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText("Taille : 3 × 1")).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Élargir" })).toBeDisabled();
    await menu.getByRole("menuitem", { name: "Grandir" }).click();
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x2");
    await expect(menu.getByText("Taille : 3 × 2")).toBeVisible();
    await expect(announcement(page)).toHaveText("Hauteur 2 sur 3");
    await page.keyboard.press("Escape");
    expect(holes(await cards(page))).toEqual([]);

    const tonight = handle(page, "Pour ce soir");
    await tonight.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("+");
    await expect(announcement(page)).toHaveText("Largeur 3, agrandie pour ne laisser aucun vide");
    const said = await announcement(page).textContent();
    await page.keyboard.press("+");
    await expect.poll(() => announcement(page).textContent()).not.toBe(said);
    await page.keyboard.press("Space");
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x2");
    await expect.poll(() => saved.length).toBe(1);
  });
});

test.describe("the home resized with a pointer", () => {
  test.use({ storageState: STORAGE_STATE, viewport: WIDE });

  test("grows a block by its corner, narrows another by the opposite corner, widens a third by its edge, snapped to cases", async ({
    page,
  }) => {
    const saved = await openHome(page);
    await arrange(page);
    await expect(tile(page, "tonight").locator(".react-resizable-handle")).toHaveCount(8);

    const step = await caseOf(page, "review", { w: 1, h: 1 });
    await pullWithMouse(page, edge(page, "tonight", "se"), { x: 0, y: step.y * 0.7 });
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x2");
    await expect.poll(() => saved.length).toBe(1);
    expect(holes(await cards(page))).toEqual([]);

    await pullWithMouse(page, edge(page, "documents", "nw"), { x: step.x * 0.6, y: 0 });
    await expect(tile(page, "documents")).toHaveAttribute("data-size", "1x1");
    expect(holes(await cards(page))).toEqual([]);

    await pullWithMouse(page, edge(page, "review", "e"), { x: step.x * 0.4, y: 0 });
    await expect(tile(page, "review")).toHaveAttribute("data-size", "1x1");
    await pullWithMouse(page, edge(page, "review", "e"), { x: step.x * 0.7, y: 0 });
    await expect(tile(page, "review")).toHaveAttribute("data-size", "2x1");
    expect(holes(await cards(page))).toEqual([]);

    const arranging = await cards(page);
    await finish(page);
    expect(apart(arranging, await cards(page))).toEqual([]);
    expect(await domOrder(page)).toEqual(inReadingOrder(await cards(page)));
  });

  test("stops a block at its bounds however far the handle goes", async ({ page }) => {
    await openHome(page);
    await arrange(page);

    const step = await caseOf(page, "review", { w: 1, h: 1 });
    await pullWithMouse(page, edge(page, "tonight", "se"), { x: step.x * 3, y: step.y * 5 });
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "2x3");
    await pullWithMouse(page, edge(page, "tonight", "nw"), { x: step.x * 3, y: step.y * 5 });
    await expect(tile(page, "tonight")).toHaveAttribute("data-size", "1x1");
    expect(holes(await cards(page))).toEqual([]);
  });
});

test.describe("the home arranged by touch", () => {
  test.use({ storageState: STORAGE_STATE, viewport: PHONE, hasTouch: true, isMobile: true });

  async function touchOf(page: Page) {
    const cdp: CDPSession = await page.context().newCDPSession(page);
    type TouchType = "touchStart" | "touchMove" | "touchEnd";
    const send = (type: TouchType, x?: number, y?: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: x === undefined || y === undefined ? [] : [{ x, y }],
      });

    return {
      start: (x: number, y: number) => send("touchStart", x, y),
      move: (x: number, y: number) => send("touchMove", x, y),
      end: () => send("touchEnd"),
      async slide(from: { x: number; y: number }, to: { x: number; y: number }, steps = 20) {
        await send("touchStart", from.x, from.y);
        for (let step = 1; step <= steps; step++) {
          const progress = step / steps;
          await send(
            "touchMove",
            from.x + (to.x - from.x) * progress,
            from.y + (to.y - from.y) * progress,
          );
          await page.waitForTimeout(16);
        }
      },
    };
  }

  test("resizes a block by its corner and another by its edge with a finger, snapped to rows, the same once read", async ({
    page,
  }) => {
    const saved = await openHome(page);
    await arrange(page);
    const touch = await touchOf(page);
    const step = await caseOf(page, "review", { w: 1, h: 1 });

    const corner = await centerOf(edge(page, "review", "se"));
    await touch.slide(corner, { x: corner.x, y: corner.y + step.y * 0.7 });
    await touch.end();
    await expect(tile(page, "review")).toHaveAttribute("data-size", "1x2");
    await expect.poll(() => saved.length).toBe(1);

    await settled(page);
    const bottom = await centerOf(edge(page, "overdue", "s"));
    await touch.slide(bottom, { x: bottom.x, y: bottom.y + step.y * 1.6 });
    await touch.end();
    await expect(tile(page, "overdue")).toHaveAttribute("data-size", "1x3");
    expect(holes(await cards(page))).toEqual([]);

    const arranging = await cards(page);
    await finish(page);
    expect(apart(arranging, await cards(page))).toEqual([]);
  });

  test("reorders with the grip of a tile, while a slide on its body scrolls the page", async ({
    page,
  }) => {
    await openHome(page);
    await arrange(page);
    const touch = await touchOf(page);

    const before = await domOrder(page);
    const target = await centerOf(gripOf(page, "review"));
    const from = await centerOf(gripOf(page, "overdue"));
    await touch.slide(from, { x: target.x - 20, y: target.y });
    await touch.end();
    await expect.poll(() => domOrder(page)).not.toEqual(before);
    expect((await domOrder(page)).indexOf("overdue")).toBeLessThan(before.indexOf("overdue"));

    const after = await domOrder(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const body = { x: PHONE.width / 2, y: PHONE.height - 120 };
    const touched = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest("[data-slot=dashboard-tile-toolbar], [data-block]")
          ?.getAttribute("data-slot"),
      body,
    );
    expect(touched).not.toBe("dashboard-tile-toolbar");
    await touch.slide(body, { x: body.x, y: body.y - 300 });
    await touch.end();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    expect(await domOrder(page)).toEqual(after);
  });

  test("scrolls the page while the finger holds at its edge, faster deeper in, and stops on release", async ({
    page,
  }) => {
    await openHome(page);
    await arrange(page);
    const touch = await touchOf(page);
    const grip = await centerOf(gripOf(page, "review"));
    const scrollY = () => page.evaluate(() => window.scrollY);

    await touch.slide(grip, { x: grip.x, y: PHONE.height - 50 }, 10);
    await expect(page.locator(".react-draggable-dragging")).toHaveCount(1);
    const shallowStart = await scrollY();
    await page.waitForTimeout(400);
    const shallow = (await scrollY()) - shallowStart;
    expect(shallow).toBeGreaterThan(0);

    await touch.move(grip.x, PHONE.height - 4);
    const deepStart = await scrollY();
    await page.waitForTimeout(400);
    const deep = (await scrollY()) - deepStart;
    expect(deep).toBeGreaterThan(shallow * 1.5);

    const finger = PHONE.height - 4;
    const tile = await page.locator(".react-draggable-dragging").boundingBox();
    expect(tile && Math.abs(tile.y + tile.height / 2 - finger)).toBeLessThan(
      tile ? tile.height : 0,
    );

    await touch.end();
    const released = await scrollY();
    await page.waitForTimeout(300);
    expect(await scrollY()).toBe(released);
  });

  test("moves nothing on its own under reduced motion while the finger holds at the edge", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openHome(page);
    await arrange(page);
    const touch = await touchOf(page);
    const grip = await centerOf(gripOf(page, "review"));
    const scrollY = () => page.evaluate(() => window.scrollY);

    await touch.slide(grip, { x: grip.x, y: PHONE.height - 4 }, 10);
    const held = await scrollY();
    await page.waitForTimeout(400);
    expect(await scrollY()).toBe(held);

    await touch.move(grip.x, PHONE.height - 5);
    await expect.poll(scrollY).toBeGreaterThan(held);
    await touch.end();
  });

  test("opens the menu of a block with a long press on its header while the home is read", async ({
    page,
  }) => {
    await openHome(page);
    const touch = await touchOf(page);
    const header = await centerOf(
      page.locator("[data-block=review] [data-slot=dashboard-panel-header]"),
    );

    await touch.start(header.x, header.y);
    await page.waitForTimeout(900);
    await touch.end();

    await expect(page.getByRole("menuitem", { name: "Modifier l'accueil" })).toBeVisible();
  });
});
