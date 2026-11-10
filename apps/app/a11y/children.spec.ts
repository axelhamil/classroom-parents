import { blockingViolations } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";
import { FIXTURE_CHILD_LABEL, stubChildrenApi } from "./children-fixture";
import { STORAGE_STATE } from "./playwright.config";

test.use({ storageState: STORAGE_STATE });

test("lists every child state on a phone with one main, one h1 and no overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubChildrenApi(page);
  await page.goto("/children");

  await expect(page.getByRole("button", { name: "Partager avec l'école" })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  expect(await blockingViolations(page)).toEqual([]);
});

test("traps focus in the disconnect dialog and gives it back on Escape", async ({ page }) => {
  await stubChildrenApi(page);
  await page.goto("/children");

  const card = page.getByRole("listitem").filter({ hasText: FIXTURE_CHILD_LABEL });
  const trigger = card.getByRole("button", { name: "Déconnecter" });
  await trigger.click();

  const dialog = page.getByRole("alertdialog", { name: `Déconnecter ${FIXTURE_CHILD_LABEL} ?` });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("retirons l'accès Google");

  for (const key of [...Array(6).fill("Tab"), ...Array(6).fill("Shift+Tab")]) {
    await page.keyboard.press(key);
    const contained = await dialog.evaluate((el) => el.contains(document.activeElement));
    expect(contained, `focus escaped the dialog on ${key}`).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
