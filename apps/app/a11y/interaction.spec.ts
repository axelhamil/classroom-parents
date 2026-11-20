import { blockingViolations, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import type { Locator, Page } from "@playwright/test";
import { FIXTURE_CHILD_LABEL, stubChildrenApi } from "./children-fixture";
import { showColorScheme } from "./color-scheme";
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
import { lowestGraphicContrast } from "./graphic-contrast";
import { STORAGE_STATE } from "./playwright.config";

type ThemeProbe = Window & { __themeTransitioned?: boolean };

async function openDeletionDialog(page: Page): Promise<{ trigger: Locator; dialog: Locator }> {
  await page.goto("/settings");

  const trigger = page.getByRole("button", { name: "Supprimer mon compte" });
  await page.getByText(/^Votre compte, les comptes Google de vos enfants/).click();
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("alertdialog", { name: "Supprimer votre compte ?" });
  await expect(dialog).toBeVisible();

  return { trigger, dialog };
}

async function openCustomizeDialog(page: Page): Promise<{ trigger: Locator; dialog: Locator }> {
  await page.goto("/children");

  const trigger = page.getByRole("button", { name: `Actions pour ${FIXTURE_CHILD_LABEL}` });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Personnaliser" }).click();

  const dialog = page.getByRole("dialog", { name: "Personnaliser" });
  await expect(dialog).toBeVisible();

  return { trigger, dialog };
}

// A fade driven by scrolling follows the scroll position and never stops running: only
// the animations that run in time can settle.
function noTimedAnimationRunning(): boolean {
  return document
    .getAnimations()
    .every(
      (animation) => animation.timeline !== document.timeline || animation.playState !== "running",
    );
}

async function ringContrastBelow(surface: Locator, control: Locator): Promise<number> {
  await control.page().waitForFunction(noTimedAnimationRunning);
  const [frame, box] = await Promise.all([surface.boundingBox(), control.boundingBox()]);
  if (!frame || !box) throw new Error("the dialog or its control has no box");

  const column = Math.round(box.x + box.width / 2 - frame.x);
  const ringRow = Math.ceil(box.y + box.height - frame.y) + 1;
  const shot = await surface.screenshot();

  return control.page().evaluate(
    async ({ png, column, ringRow }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no 2d context");
      context.drawImage(image, 0, 0);

      const luminance = (row: number) => {
        const [r = 0, g = 0, b = 0] = context.getImageData(column, row, 1, 1).data;
        const linear = (channel: number) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      const ring = luminance(ringRow);
      const behind = luminance(ringRow + 10);

      return (Math.max(ring, behind) + 0.05) / (Math.min(ring, behind) + 0.05);
    },
    { png: shot.toString("base64"), column, ringRow },
  );
}

test("opens an icon button tooltip on keyboard focus and closes it with Escape", async ({
  page,
}) => {
  await page.goto("/login");

  const toggle = page.getByRole("button", { name: /^Thème : / });
  await tabTo(page, toggle);

  const tooltip = page.getByRole("tooltip").filter({ hasText: /^Thème : / });
  await expect(tooltip).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(toggle).toBeFocused();
});

test("skips the theme view transition under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as Element;
        if (target.classList?.contains("theme-transitioning")) {
          (window as ThemeProbe).__themeTransitioned = true;
        }
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ["class"] });
  });

  await page.goto("/login");

  const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
  const before = await isDark();

  await page.getByRole("button", { name: /^Thème : / }).click();
  await page.getByRole("menuitemradio", { name: before ? "Clair" : "Sombre" }).click();

  await expect.poll(isDark).toBe(!before);
  const transitioned = await page.evaluate(
    () => (window as ThemeProbe).__themeTransitioned === true,
  );
  expect(transitioned).toBe(false);
});

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE });
  test.beforeEach(({ page }) => stubChildrenApi(page));

  for (const width of [390, 768, 1440]) {
    test(`keeps the shell and its navigation inside a ${width} px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/");

      const nav = page.getByRole("navigation", { name: "Navigation principale" });
      for (const name of ["Accueil", "Enfants", "Réglages"]) {
        await expect(nav.getByRole("link", { name })).toBeInViewport({ ratio: 1 });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  for (const width of [390, 768, 1440]) {
    test(`keeps the navigation still across pages at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");

      const nav = page.getByRole("navigation", { name: "Navigation principale" });
      const boxes = async () => {
        await expect(nav.getByRole("link")).toHaveCount(3);
        await page.waitForFunction(() => document.fonts.status === "loaded");
        await page.waitForFunction(noTimedAnimationRunning);
        return Promise.all(
          [nav, ...(await nav.getByRole("link").all())].map((element) => element.boundingBox()),
        );
      };

      const onHome = await boxes();
      for (const [name, path] of [
        ["Enfants", /\/children$/],
        ["Réglages", /\/settings$/],
      ] as const) {
        await nav.getByRole("link", { name }).click();
        await expect(page).toHaveURL(path);
        await expect(page.locator("main")).toBeVisible();
        expect(await boxes()).toEqual(onHome);
      }
    });
  }

  test("traps focus inside a dialog and gives it back to its trigger on Escape", async ({
    page,
  }) => {
    const { trigger, dialog } = await openDeletionDialog(page);

    for (const key of [...Array(10).fill("Tab"), ...Array(10).fill("Shift+Tab")]) {
      await page.keyboard.press(key);
      const contained = await dialog.evaluate((el) => el.contains(document.activeElement));
      expect(contained, `focus escaped the dialog on ${key}`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`draws the destructive focus ring at 3:1 against its surface (${colorScheme})`, async ({
      page,
    }) => {
      await showColorScheme(page, colorScheme);
      const { dialog } = await openDeletionDialog(page);

      const confirm = dialog.getByRole("button", { name: "Oui, supprimer mon compte" });
      await tabTo(page, confirm);

      expect(await ringContrastBelow(dialog, confirm)).toBeGreaterThanOrEqual(3);
    });
  }

  test("opens the user menu from the keyboard and gives focus back on Escape", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "Ouvrir le menu utilisateur" });
    await tabTo(page, trigger);
    await page.keyboard.press("Enter");

    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Se déconnecter" })).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: "Automatique" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("switches the theme from the appearance radio group with the arrow keys", async ({
    page,
  }) => {
    await page.goto("/settings");

    const light = page.getByRole("radio", { name: "Clair" });
    await page.getByText(/^Le thème et les couleurs de l'application sur cet appareil/).click();
    await page.keyboard.press("Tab");
    await expect(light).toBeFocused();
    await page.keyboard.press("ArrowRight", { delay: 50 });

    await expect(page.getByRole("radio", { name: "Sombre" })).toBeFocused();
    await expect(page.getByRole("radio", { name: "Sombre" })).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.keyboard.press("ArrowLeft", { delay: 50 });
    await expect(light).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("picks a child's color from the swatch radio group with the arrow keys", async ({
    page,
  }) => {
    const { trigger, dialog } = await openCustomizeDialog(page);

    const blue = dialog.getByRole("radio", { name: "Bleu" });
    await tabTo(page, blue);
    await expect(blue).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight", { delay: 50 });

    const violet = dialog.getByRole("radio", { name: "Violet" });
    await expect(violet).toBeFocused();
    await expect(violet).toHaveAttribute("aria-checked", "true");
    await expect(blue).toHaveAttribute("aria-checked", "false");

    await page.keyboard.press("ArrowLeft", { delay: 50 });
    await expect(blue).toBeFocused();
    await expect(blue).toHaveAttribute("aria-checked", "true");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  // A busy main thread moves the focus only after the arrow key is already up: the
  // press and release are dispatched in one task so the release always wins that race.
  test("checks the swatch an arrow reaches even when the key is released before the focus moves", async ({
    page,
  }) => {
    const { dialog } = await openCustomizeDialog(page);

    const blue = dialog.getByRole("radio", { name: "Bleu" });
    await tabTo(page, blue);
    await blue.evaluate((swatch) => {
      for (const type of ["keydown", "keyup"]) {
        swatch.dispatchEvent(new KeyboardEvent(type, { key: "ArrowRight", bubbles: true }));
      }
    });

    const violet = dialog.getByRole("radio", { name: "Violet" });
    await expect(violet).toBeFocused();
    await expect(violet).toHaveAttribute("aria-checked", "true");
    await expect(blue).toHaveAttribute("aria-checked", "false");
  });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`outlines the chosen swatch at 3:1 and passes axe in the dialog (${colorScheme})`, async ({
      page,
    }) => {
      await showColorScheme(page, colorScheme);
      await openCustomizeDialog(page);

      expect(
        await lowestGraphicContrast(
          page,
          "[data-slot=hue-radio-group] [role=radio][data-state=checked]",
          "outlineColor",
        ),
      ).toBeGreaterThanOrEqual(3);
      await expect(page.getByRole("radio", { name: "Photo du compte Google" })).toBeVisible();
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("switches the palette from the appearance radio group with the arrow keys", async ({
    page,
  }) => {
    await page.goto("/settings");

    const paper = page.getByRole("radio", { name: "Papier" });
    await page.getByRole("radio", { name: "Clair" }).focus();
    await page.keyboard.press("Tab");
    await expect(paper).toBeFocused();
    await page.keyboard.press("ArrowRight", { delay: 50 });

    await expect(page.getByRole("radio", { name: "Ardoise" })).toBeFocused();
    await expect(page.getByRole("radio", { name: "Ardoise" })).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "slate");

    await page.keyboard.press("ArrowLeft", { delay: 50 });
    await expect(paper).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-palette", "paper");
  });

  test("reaches every section from the bottom navigation on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Navigation principale" });
    await nav.getByRole("link", { name: "Réglages" }).click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(nav.getByRole("link", { name: "Réglages" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

test.describe("calendar month grid", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("walks the days with the arrows, Home, End and the page keys, Enter picks one", async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 11, 10));
    await serveFamily(page, { children: [LEA], events: [] });
    await page.goto("/?view=month&date=2026-11-11");

    const day = (date: string) => page.locator(`[data-day="${date}"] button`);
    await expect(page.locator("[aria-current=date]")).toHaveCount(1);
    await expect(day("2026-11-11")).toHaveAttribute("aria-current", "date");
    await day("2026-11-11").focus();

    await page.keyboard.press("ArrowRight");
    await expect(day("2026-11-12")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(day("2026-11-19")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(day("2026-11-16")).toBeFocused();
    await page.keyboard.press("End");
    await expect(day("2026-11-22")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]date=2026-11-21/);
    await expect(day("2026-11-21")).toBeFocused();

    await page.keyboard.press("PageDown");
    await expect(day("2026-12-21")).toBeFocused();
    await expect(page.getByRole("heading", { level: 2, name: "décembre 2026" })).toBeVisible();
    await page.keyboard.press("PageUp");
    await expect(day("2026-11-21")).toBeFocused();
  });
});

const DEFAULT_HOME = [
  "today",
  "tonight",
  "review",
  "calendar",
  "overdue",
  "assessments",
  "documents",
  "notes",
];

async function serveHome(page: Page): Promise<unknown[]> {
  const saved: unknown[] = [];
  let layout: unknown = null;
  await page.route(
    (url) => url.pathname.startsWith("/home/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/home/note") return route.fulfill({ json: { body: "", updatedAt: null } });
      if (request.method() === "PUT") {
        const body: { blocks: unknown } = request.postDataJSON();
        saved.push(body);
        layout = body.blocks;
      }
      return route.fulfill({ json: { blocks: layout } });
    },
  );

  return saved;
}

function placedBlocks(page: Page): Promise<(string | undefined)[]> {
  return page
    .locator("[data-block]")
    .evaluateAll((blocks) => blocks.map((block) => (block as HTMLElement).dataset.block).sort());
}

function homeOrder(page: Page): Promise<(string | undefined)[]> {
  return page
    .locator("[data-slot=dashboard-tile]")
    .evaluateAll((tiles) => tiles.map((tile) => (tile as HTMLElement).dataset.block));
}

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The card of each block, from the corner of the grid that holds it: the CSS grid while the home is
 * read, the react-grid-layout container while it is arranged. Measured once nothing moves.
 */
async function tileRects(page: Page): Promise<Record<string, TileRect>> {
  const grid = page.locator(".react-grid-layout, [data-slot=dashboard]:not([aria-hidden])").first();
  await expect.poll(() => page.evaluate(noTimedAnimationRunning)).toBe(true);

  return grid.evaluate((el) => {
    const origin = el.getBoundingClientRect();
    const tiles = [...el.querySelectorAll<HTMLElement>("[data-block][data-size]")];

    return Object.fromEntries(
      tiles.map((tile) => {
        const panel = tile.querySelector("[data-slot=dashboard-panel]") ?? tile;
        const box = panel.getBoundingClientRect();
        const rect = {
          x: box.x - origin.x,
          y: box.y - origin.y,
          width: box.width,
          height: box.height,
        };

        return [tile.dataset.block ?? "", rect];
      }),
    );
  });
}

test.describe("home grid", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 10, 12, 10));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: [] });
  });

  // T5: the drag and the menus come with the edit grid; T7 rewrites this contract.
  test.fixme("arranges the home from the keyboard: move, resize, hide, add back and reset", async ({
    page,
  }) => {
    const saved = await serveHome(page);
    await page.goto("/");
    await expect.poll(() => placedBlocks(page)).toEqual([...DEFAULT_HOME].sort());

    const edit = page.getByRole("button", { name: "Modifier l'accueil" });
    await tabTo(page, edit);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Terminé" })).toBeFocused();
    await expect.poll(() => homeOrder(page)).toEqual(DEFAULT_HOME);

    await tabTo(page, page.getByRole("button", { name: "Déplacer Pour ce soir" }));
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("[id^=dnd-kit-announcement]")).toHaveText(
      "Pour ce soir, position 1 sur 8",
    );
    await page.keyboard.press("Space");
    await expect
      .poll(() => homeOrder(page))
      .toEqual(["tonight", "today", ...DEFAULT_HOME.slice(2)]);
    await expect(page.locator("[id^=dnd-kit-announcement]")).toHaveText(
      "Pour ce soir posé en position 1 sur 8",
    );

    await page.getByRole("button", { name: "Élargir Pour ce soir" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-block=tonight]")).toHaveAttribute("data-w", "6");
    await expect(page.getByRole("status").filter({ hasText: "Élargi" })).toHaveText(
      "Élargi, 6 colonnes sur 12",
    );

    await page.getByRole("button", { name: "Masquer Pense-bête" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-block=notes]")).toHaveCount(0);
    const add = page.getByRole("button", { name: "Ajouter un bloc" });
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog", { name: "Ajouter un bloc" });
    await tabTo(page, drawer.getByRole("button", { name: "Ajouter Pense-bête" }));
    await page.keyboard.press("Enter");
    await expect(drawer).toBeHidden();
    await expect(add).toBeFocused();
    await expect.poll(async () => (await homeOrder(page)).at(-1)).toBe("notes");

    await page.getByRole("button", { name: "Rétablir l'accueil par défaut" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").getByRole("button", { name: "Rétablir" }).click();
    await expect.poll(() => homeOrder(page)).toEqual(DEFAULT_HOME);
    await expect.poll(() => saved.at(-1)).toEqual({ blocks: null });
  });

  for (const width of [768, 1440]) {
    test(`leaves no hole between two blocks of a column at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.clock.setFixedTime(todayAt("09:00"));
      const nothingForTomorrow = EVENTS.filter((event) => event.deadlineDate !== inDays(1));
      await serveFamily(page, { children: [LEA, MAXIMILIEN], events: nothingForTomorrow });
      await serveHome(page);
      await page.goto("/");
      await expect(page.locator("[data-block=calendar]")).toBeVisible();
      await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

      const holes = await page.locator("[data-slot=dashboard-tile]").evaluateAll((tiles) => {
        const surfaces = tiles.map((tile) => ({
          block: (tile as HTMLElement).dataset.block,
          box: (tile.firstElementChild ?? tile).getBoundingClientRect(),
        }));

        return surfaces.flatMap(({ block, box }) => {
          const below = surfaces.filter(
            (other) =>
              other.box.top >= box.bottom - 1 &&
              other.box.left < box.right - 1 &&
              other.box.right > box.left + 1,
          );
          if (below.length === 0) return [];
          const gap = Math.min(...below.map((other) => other.box.top)) - box.bottom;

          return gap > 24 ? [`${block} ${Math.round(gap)}px`] : [];
        });
      });
      expect(holes).toEqual([]);
    });
  }

  test("draws every block at the same place and size whether the home is read or arranged", async ({
    page,
  }) => {
    await page.clock.setFixedTime(todayAt("18:30"));
    const nothingForTomorrow = EVENTS.filter((event) => event.deadlineDate !== inDays(1));
    await serveFamily(page, { children: [LEA, MAXIMILIEN], events: nothingForTomorrow });
    await serveHome(page);
    await page.goto("/");
    await expect(page.locator("[data-block=calendar]")).toBeVisible();
    await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);
    const reading = await tileRects(page);

    await page.getByRole("button", { name: "Modifier l'accueil" }).click();
    await expect(page.getByRole("group", { name: "Disposition de Agenda" })).toBeVisible();
    const arranging = await tileRects(page);

    expect(Object.keys(arranging)).toEqual(Object.keys(reading));
    const moved = Object.entries(reading).flatMap(([block, rect]) => {
      const other = arranging[block];
      const apart = (["x", "y", "width", "height"] as const).filter(
        (side) => !other || Math.abs(other[side] - rect[side]) > 1,
      );

      return apart.length > 0 ? [`${block}: ${apart.join(", ")}`] : [];
    });
    expect(moved).toEqual([]);
  });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`passes axe while the home is being arranged (${colorScheme})`, async ({ page }) => {
      await showColorScheme(page, colorScheme);
      await serveHome(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Modifier l'accueil" }).click();
      await expect(page.getByRole("group", { name: "Disposition de Agenda" })).toBeVisible();

      expect(await blockingViolations(page)).toEqual([]);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
    });
  }
});

test.describe("deadline steps", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1440, height: 900 } });

  test("keeps each step its own control inside the card, after the title, ticked with Space", async ({
    page,
  }) => {
    const swimming = {
      ...REVIEW_EVENT,
      title: "Piscine",
      category: "swimming",
      status: "confirmed",
      deadlineDate: "2026-11-12",
      deadlineAt: "2026-11-12T07:00:00.000Z",
      checklist: { done: [] as string[], removed: [], extra: [] },
    };
    await page.clock.setFixedTime(new Date(2026, 10, 12, 10));
    await serveFamily(page, { children: [LEA], events: [swimming] });
    await serveHome(page);
    await page.route(`**/events/${swimming.id}/checklist`, async (route) => {
      const change: { kind: string; itemId: string; done: boolean } = route
        .request()
        .postDataJSON();
      if (change.kind === "tick" && change.done) swimming.checklist.done.push(change.itemId);
      await route.fulfill({ json: swimming });
    });
    await page.goto("/");

    const briefing = page.getByRole("region", { name: "Pour aujourd'hui" });
    const title = briefing.getByRole("link", { name: "Piscine" });
    const swimsuit = briefing.getByRole("checkbox", { name: "Maillot de bain" });
    await expect(swimsuit).toBeVisible();

    const nested = await page.evaluate(() =>
      [...document.querySelectorAll("a, button, input, [role=checkbox]")].some((control) =>
        control.parentElement?.closest("a, button"),
      ),
    );
    expect(nested).toBe(false);

    await title.focus();
    await page.keyboard.press("Tab");
    await expect(swimsuit).toBeFocused();
    await page.keyboard.press("Space");
    await expect(swimsuit).toHaveAttribute("aria-checked", "true");
    await expect(page).not.toHaveURL(/[?&]event=/);
  });
});
