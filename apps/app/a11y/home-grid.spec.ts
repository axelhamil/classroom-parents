import { blockingViolations, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import type { CDPSession, Locator, Page } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { EVENTS, inDays, LEA, MAXIMILIEN, serveFamily, todayAt } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

interface Block {
  id: string;
  size: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ARRANGED: Block[] = [
  { id: "today", size: "l" },
  { id: "tonight", size: "m" },
  { id: "review", size: "s" },
  { id: "overdue", size: "s" },
  { id: "calendar", size: "xl" },
  { id: "assessments", size: "m" },
  { id: "documents", size: "m" },
  { id: "notes", size: "m" },
];

const WIDTHS = [390, 768, 1440] as const;

const PHONE = { width: 390, height: 844 };

const QUIET_EVENTS = EVENTS.filter((event) => event.deadlineDate !== inDays(1));

/** The home served with a revision, every save kept and answered with the next revision. */
async function serveLayout(page: Page, blocks: Block[] | null = ARRANGED): Promise<unknown[]> {
  const saved: unknown[] = [];
  let layout: unknown = blocks;
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

      return route.fulfill({ json: { blocks: layout, revision } });
    },
  );

  return saved;
}

async function openHome(page: Page, blocks: Block[] | null = ARRANGED): Promise<unknown[]> {
  await page.clock.setFixedTime(todayAt("18:30"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: QUIET_EVENTS });
  const saved = await serveLayout(page, blocks);
  await page.goto("/");
  await expect(page.locator("[data-block=calendar]")).toBeVisible();
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  return saved;
}

async function arrange(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Modifier l'accueil" }).click();
  await expect(page.locator(".react-grid-layout")).toBeVisible();
  await settled(page);
}

async function finish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Terminé" }).click();
  await expect(page.locator(".react-grid-layout")).toHaveCount(0);
}

function settled(page: Page): Promise<void> {
  return expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.timeline !== document.timeline || animation.playState !== "running",
          ),
      ),
    )
    .toBe(true);
}

/** The card of each block, from the corner of the grid that holds it, in reading order. */
async function cards(page: Page): Promise<Record<string, Rect>> {
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

function apart(reading: Record<string, Rect>, arranging: Record<string, Rect>): string[] {
  return Object.entries(reading).flatMap(([block, rect]) => {
    const other = arranging[block];
    const sides = (["x", "y", "width", "height"] as const).filter(
      (side) => !other || Math.abs(other[side] - rect[side]) > 1,
    );

    return sides.length > 0 ? [`${block}: ${sides.join(", ")}`] : [];
  });
}

/** Every pair of horizontal neighbours and every column meets with one gap, never a hole. */
function holes(rects: Record<string, Rect>): string[] {
  const boxes = Object.entries(rects);
  const gaps = boxes.flatMap(([block, box]) => {
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

  return gaps;
}

function domOrder(page: Page): Promise<string[]> {
  return page
    .locator("[data-block][data-size]")
    .evaluateAll((tiles) => tiles.map((tile) => (tile as HTMLElement).dataset.block ?? ""));
}

function announcement(page: Page): Locator {
  return page.locator("p[role=status].sr-only");
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
    test(`draws every block at the same place and size read or arranged, with no hole, in the order of the layout (${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openHome(page);
      const reading = await cards(page);

      await arrange(page);
      const arranging = await cards(page);
      expect(Object.keys(arranging).sort()).toEqual(Object.keys(reading).sort());
      expect(apart(reading, arranging)).toEqual([]);
      expect(holes(arranging)).toEqual([]);
      expect(await domOrder(page)).toEqual(ARRANGED.map(({ id }) => id));

      await finish(page);
      const back = await cards(page);
      expect(apart(reading, back)).toEqual([]);
      expect(holes(back)).toEqual([]);
      expect(await domOrder(page)).toEqual(ARRANGED.map(({ id }) => id));
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
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

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
    await expect(announcement(page)).toHaveText("Pour ce soir, position 2 sur 8, taille moyenne");

    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(() => domOrder(page))
      .toEqual(["tonight", "today", ...ARRANGED.slice(2).map(({ id }) => id)]);
    await expect(tonight).toBeFocused();
    await expect(announcement(page)).toHaveText("Pour ce soir, position 1 sur 8, taille moyenne");

    await page.keyboard.press("+");
    await expect(page.locator("[data-block=tonight]")).toHaveAttribute("data-size", "l");
    await expect(announcement(page)).toHaveText("Pour ce soir, position 1 sur 8, taille grande");

    await page.keyboard.press("Space");
    await expect(announcement(page)).toHaveText("Posé");
    await expect(tonight).toBeFocused();
    await expect.poll(() => saved.length).toBe(1);
    expect(saved[0]).toMatchObject({
      blocks: [{ id: "tonight", size: "l" }, { id: "today", size: "l" }, ...ARRANGED.slice(2)],
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
    await page.getByRole("menuitemradio", { name: "Grande" }).click();
    await expect(page.locator("[data-block=notes]")).toHaveAttribute("data-size", "l");

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

    await page.getByRole("button", { name: "Rétablir l'accueil par défaut" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Rétablir" }).click();
    await expect
      .poll(() => saved.at(-1))
      .toEqual({ blocks: null, baseRevision: expect.any(Number) });
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
    await page.getByRole("menuitemradio", { name: "Moyenne" }).click();

    await expect(page.locator("[data-block=review]")).toHaveAttribute("data-size", "m");
    await expect(page.locator(".react-grid-layout")).toHaveCount(0);
    await expect.poll(() => saved.length).toBe(1);
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
