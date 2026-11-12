import { COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { STORAGE_STATE } from "./playwright.config";

type ThemeProbe = Window & { __themeTransitioned?: boolean };

async function openDeletionDialog(page: Page): Promise<{ trigger: Locator; dialog: Locator }> {
  await page.goto("/settings");

  const trigger = page.getByRole("button", { name: "Supprimer mon compte" });
  await tabTo(page, trigger);
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("alertdialog", { name: "Supprimer votre compte ?" });
  await expect(dialog).toBeVisible();

  return { trigger, dialog };
}

async function ringContrastBelow(surface: Locator, control: Locator): Promise<number> {
  await control
    .page()
    .waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
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
        await page.waitForFunction(
          () =>
            document.fonts.status === "loaded" &&
            document.getAnimations().every((animation) => animation.playState !== "running"),
        );
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
      await page.emulateMedia({ colorScheme });
      const { dialog } = await openDeletionDialog(page);

      const confirm = dialog.getByRole("button", { name: "Oui, supprimer mon compte" });
      await tabTo(page, confirm);

      expect(await ringContrastBelow(dialog, confirm)).toBeGreaterThanOrEqual(3);
    });
  }

  test("names today's date tab for assistive technology", async ({ page }) => {
    await page.goto("/");

    const today = page.locator("[data-slot=date-tab][aria-label]");

    await expect(today).toHaveAttribute("aria-label", "Aujourd'hui");
    await expect(today).not.toHaveAttribute("title");
  });

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
    await tabTo(page, light);
    await page.keyboard.press("ArrowRight", { delay: 50 });

    await expect(page.getByRole("radio", { name: "Sombre" })).toBeFocused();
    await expect(page.getByRole("radio", { name: "Sombre" })).toBeChecked();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.keyboard.press("ArrowLeft", { delay: 50 });
    await expect(light).toBeChecked();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
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
