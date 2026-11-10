import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";
import { LEA, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

const WORST_CASE_EVENT = {
  ...REVIEW_EVENT,
  description:
    "Apporter le maillot 🩱🏊‍♀️ et lire https://classroom.google.com/c/MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw/a/MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkw/details?authuser=1",
  deadlineTime: "08:30",
};

test.describe("event edit on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const colorScheme of COLOR_SCHEMES) {
    test(`prefilled form with a long title and an unbreakable link (${colorScheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await serveFamily(page, { children: [LEA], events: [], detail: WORST_CASE_EVENT });
      await page.goto(`/events/${REVIEW_EVENT.id}/edit`);

      await expect(page.getByLabel("Titre")).toHaveValue(REVIEW_EVENT.title);
      await expect(page.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }

  test("an invalid title shows its error inline", async ({ page }) => {
    await serveFamily(page, { children: [LEA], events: [], detail: WORST_CASE_EVENT });
    await page.goto(`/events/${REVIEW_EVENT.id}/edit`);

    await page.getByLabel("Titre").fill("");
    await page.getByRole("button", { name: "Enregistrer" }).click();

    await expect(page.getByText("Ce champ est obligatoire.")).toBeVisible();
    await expect(page.getByLabel("Titre")).toHaveAttribute("aria-invalid", "true");
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("leaving with unsaved changes asks first and keeps focus in the dialog", async ({
    page,
  }) => {
    await serveFamily(page, { children: [LEA], events: [], detail: WORST_CASE_EVENT });
    await page.goto(`/events/${REVIEW_EVENT.id}/edit`);

    await page.getByLabel("Titre").fill("Sortie au musée");
    await page.getByRole("button", { name: "Annuler" }).click();

    const dialog = page.getByRole("alertdialog", { name: "Quitter sans enregistrer ?" });
    await expect(dialog).toBeVisible();
    expect(await blockingViolations(page, "[role=alertdialog]")).toEqual([]);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

    await dialog.getByRole("button", { name: "Rester" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/events/${REVIEW_EVENT.id}/edit$`));
  });
});
