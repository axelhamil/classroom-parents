import { blockingViolations } from "@packages/test/a11y";
import type { Page } from "@playwright/test";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { STORAGE_STATE } from "./playwright.config";

const SECTIONS = [
  ["Notifications", "/settings/notifications"],
  ["Langue et région", "/settings/region"],
  ["Intelligence artificielle", "/settings/ai"],
  ["Apparence", "/settings/appearance"],
  ["Compte", "/settings/account"],
  ["Confidentialité", "/settings/privacy"],
  ["Aide", "/settings/help"],
] as const;

function sectionList(page: Page) {
  return page.getByRole("navigation", { name: "Sections des réglages" });
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("settings on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`lists every section, then opens one with a way back (${colorScheme})`, async ({
      page,
    }) => {
      await showColorScheme(page, colorScheme);
      await page.goto("/settings");

      const list = sectionList(page);
      for (const [name] of SECTIONS) await expect(list.getByRole("link", { name })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page)).toEqual([]);

      await list.getByRole("link", { name: "Notifications" }).click();
      await expect(page).toHaveURL(/\/settings\/notifications$/);
      await expect(page.getByRole("heading", { level: 2, name: "Notifications" })).toBeVisible();
      await expect(list).toBeHidden();
      await expect(page.getByLabel("Début")).toHaveValue("21:00");
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await blockingViolations(page)).toEqual([]);

      await page
        .getByRole("region", { name: "Notifications" })
        .getByRole("link", { name: "Réglages" })
        .click();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(list).toBeVisible();
    });
  }

  test("goes back to the list with the browser's back", async ({ page }) => {
    await page.goto("/settings");
    await sectionList(page).getByRole("link", { name: "Compte" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Compte" })).toBeVisible();

    await page.goBack();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(sectionList(page)).toBeVisible();
  });

  test("asks before signing out and keeps the session when the parent cancels", async ({
    page,
  }) => {
    await page.goto("/settings/account");

    await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Se déconnecter de ce téléphone ?" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Annuler" }).click();

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/settings\/account$/);
  });
});

test.describe("settings on two panes", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 1280, height: 900 } });

  test("opens the first section and marks it current", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings\/notifications$/);
    await expect(sectionList(page).getByRole("link", { name: "Notifications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("moves between sections from the keyboard and keeps one current", async ({ page }) => {
    await page.goto("/settings/notifications");
    const list = sectionList(page);

    await list.getByRole("link", { name: "Notifications" }).focus();
    for (const [name, path] of SECTIONS.slice(1)) {
      await page.keyboard.press("Tab");
      const link = list.getByRole("link", { name });
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(list.locator("[aria-current=page]")).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
      await link.focus();
    }
  });

  test("opens a section from its address and comes back with the browser's back", async ({
    page,
  }) => {
    await page.goto("/settings/privacy");
    const list = sectionList(page);
    await expect(list.getByRole("link", { name: "Confidentialité" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await list.getByRole("link", { name: "Aide" }).click();
    await expect(page).toHaveURL(/\/settings\/help$/);
    await page.goBack();

    await expect(page).toHaveURL(/\/settings\/privacy$/);
    await expect(page.getByRole("heading", { level: 2, name: "Confidentialité" })).toBeVisible();
  });

  test("finds a setting from the search and lands the keyboard on it", async ({ page }) => {
    await page.goto("/settings/notifications");
    await expect(page.getByRole("heading", { level: 2, name: "Notifications" })).toBeVisible();

    await page.keyboard.press("ControlOrMeta+k");
    const search = page.getByRole("combobox", { name: "Rechercher un réglage" });
    await expect(search).toBeFocused();
    await search.fill("vacances");
    await expect(page.getByRole("option", { name: /Calendrier scolaire/ })).toBeVisible();
    expect(await blockingViolations(page)).toEqual([]);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/settings\/region#school-calendar$/);
    await expect(page.getByRole("region", { name: "Calendrier scolaire" })).toBeFocused();
  });

  test("saves a switch at once, announces it and undoes it", async ({ page }) => {
    await page.goto("/settings/notifications");
    const digest = page.getByRole("switch", { name: "Recevoir le résumé du dimanche" });
    const before = await digest.getAttribute("aria-checked");

    await digest.click();

    const announcer = page.locator("[aria-live]");
    await expect(announcer.getByText("Enregistré")).toBeVisible();
    await expect(digest).not.toHaveAttribute("aria-checked", before ?? "");
    await expect(page.getByRole("button", { name: "Enregistrer" })).toHaveCount(0);

    await announcer.getByRole("button", { name: "Annuler" }).click();
    await expect(digest).toHaveAttribute("aria-checked", before ?? "");
  });

  // A row is read from its label to its control: wider than about 760 px, the eye loses the line.
  for (const width of [768, 1440, 1920]) {
    test(`keeps every row readable and lets the palettes take the room at ${width} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/settings/appearance");

      const theme = await page.getByRole("region", { name: "Thème" }).boundingBox();
      const palettes = await page.getByRole("region", { name: "Couleurs" }).boundingBox();
      expect(theme?.width).toBeLessThanOrEqual(760);
      if (width >= 1440) expect(palettes?.width).toBeGreaterThan(760);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }
});
