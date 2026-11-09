import { signInForm, tabTo } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";
import { STORAGE_STATE } from "./playwright.config";

type ThemeProbe = Window & { __themeTransitioned?: boolean };

test("reaches every sign-in control in order with the keyboard", async ({ page }) => {
  await page.goto("/sign-in");

  const form = signInForm(page);
  await tabTo(page, form.getByLabel("E-mail", { exact: true }));

  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Mot de passe", { exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(form.getByRole("checkbox", { name: "Se souvenir de moi" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(form.getByRole("button", { name: "Se connecter", exact: true })).toBeFocused();
});

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE });

  test("traps focus inside the command palette", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Palette de commandes" });
    await expect(palette).toBeVisible();

    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const contained = await palette.evaluate((el) => el.contains(document.activeElement));
      expect(contained, `focus escaped the palette after ${i + 1} Tab presses`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  for (const width of [390, 768, 1440]) {
    test(`keeps the shell inside a ${width} px viewport with long names`, async ({ page }) => {
      const longName = "Compagnie Internationale des Transports Maritimes et Fluviaux";
      await page.route(/\/api\/auth\//, async (route) => {
        const response = await route.fetch();
        const body = (await response.text()).replace(/"name":"[^"]*"/g, `"name":"${longName}"`);
        await route.fulfill({ response, body });
      });
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/settings/privacy");

      const activeTab = page
        .getByRole("navigation", { name: "Sections des paramètres" })
        .locator("a[data-active]");
      await expect(activeTab).toBeInViewport({ ratio: 1 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    });
  }

  test("opens an icon button tooltip on keyboard focus and closes it with Escape", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    const toggle = page.getByRole("button", { name: /Passer au thème (sombre|clair)/ });
    await tabTo(page, toggle);

    const tooltip = page.getByRole("tooltip").filter({ hasText: /Passer au thème (sombre|clair)/ });
    await expect(tooltip).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test("closes a dialog with one Escape while a tooltip is open inside it", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Palette de commandes" });
    await expect(palette).toBeVisible();

    await page.keyboard.press("Tab");
    await expect(page.getByRole("tooltip").filter({ hasText: "Fermer" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("reaches the primary navigation from the user menu on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Ouvrir le menu utilisateur" }).click();
    await page.getByRole("menuitem", { name: "Paramètres" }).click();

    await expect(page).toHaveURL(/\/settings/);
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

    await page.goto("/dashboard");

    const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
    const before = await isDark();

    await page.getByRole("button", { name: /Passer au thème (sombre|clair)/ }).click();

    await expect.poll(isDark).toBe(!before);
    const transitioned = await page.evaluate(
      () => (window as ThemeProbe).__themeTransitioned === true,
    );
    expect(transitioned).toBe(false);
  });
});
