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

test("opens an icon button tooltip on keyboard focus and closes it with Escape", async ({
  page,
}) => {
  await page.goto("/login");

  const toggle = page.getByRole("button", { name: /Passer au thème (sombre|clair)/ });
  await tabTo(page, toggle);

  const tooltip = page.getByRole("tooltip").filter({ hasText: /Passer au thème (sombre|clair)/ });
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

  await page.getByRole("button", { name: /Passer au thème (sombre|clair)/ }).click();

  await expect.poll(isDark).toBe(!before);
  const transitioned = await page.evaluate(
    () => (window as ThemeProbe).__themeTransitioned === true,
  );
  expect(transitioned).toBe(false);
});

test.describe("signed in", () => {
  test.use({ storageState: STORAGE_STATE });

  for (const width of [390, 768, 1440]) {
    test(`keeps the shell and its navigation inside a ${width} px viewport`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/");

      const nav = page.getByRole("navigation", { name: "Navigation principale" });
      for (const name of ["Échéances", "Historique", "Enfants", "Réglages"]) {
        await expect(nav.getByRole("link", { name })).toBeInViewport({ ratio: 1 });
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }

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
