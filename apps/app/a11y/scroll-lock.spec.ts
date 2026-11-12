import { expect, test } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { STORAGE_STATE } from "./playwright.config";

test.use({
  storageState: STORAGE_STATE,
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});
test.beforeEach(({ page }) => stubChildrenApi(page));

for (const width of [390, 768, 1440]) {
  test(`keeps the shell still when the user menu opens at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 400 });
    await page.goto("/settings");
    await expect(page.locator("main")).toBeVisible();

    const trigger = page.getByRole("button", { name: "Ouvrir le menu utilisateur" });
    const elements = await Promise.all([
      page.getByRole("navigation", { name: "Navigation principale" }).elementHandle(),
      trigger.elementHandle(),
    ]);
    const boxes = () => Promise.all(elements.map((element) => element?.boundingBox()));

    const closed = await boxes();
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    expect(await boxes()).toEqual(closed);
  });
}
