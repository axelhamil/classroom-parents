import { expect, test } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { inDays, LEA, REVIEW_EVENT, serveFamily, todayAt } from "./events-fixtures";
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

for (const width of [390, 1440]) {
  test(`keeps the page still when the late deadlines open at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.clock.setFixedTime(todayAt("09:00"));
    const late = {
      ...REVIEW_EVENT,
      status: "confirmed",
      deadlineDate: inDays(-2),
      deadlineAt: `${inDays(-2)}T07:00:00.000Z`,
    };
    await serveFamily(page, { children: [LEA], events: [late] });
    await page.goto("/");

    const trigger = page.getByRole("button", { name: "En retard, 1 échéance" });
    const elements = await Promise.all([
      page.getByRole("navigation", { name: "Navigation principale" }).elementHandle(),
      trigger.elementHandle(),
    ]);
    const boxes = () => Promise.all(elements.map((element) => element?.boundingBox()));

    const closed = await boxes();
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "En retard, 1 échéance" })).toBeVisible();

    expect(await boxes()).toEqual(closed);
    await page.mouse.wheel(0, 400);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
}
