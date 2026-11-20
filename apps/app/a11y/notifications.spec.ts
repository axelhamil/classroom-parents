import { blockingViolations, COLOR_SCHEMES } from "@packages/test/a11y";
import { recordBadge } from "./app-badge";
import { stubChildrenApi } from "./children-fixture";
import { showColorScheme } from "./color-scheme";
import { expect, test } from "./csp";
import { stubNotificationsApi, UNREAD_COUNT } from "./notifications-fixture";
import { STORAGE_STATE } from "./playwright.config";

test.use({ storageState: STORAGE_STATE });

const SURFACE: Record<number, string> = { 390: "drawer-content", 1440: "popover-content" };

for (const width of [390, 1440]) {
  for (const colorScheme of COLOR_SCHEMES) {
    test(`notification center opens from the bell as a ${SURFACE[width]}, traps focus and gives it back at ${width} px (${colorScheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await showColorScheme(page, colorScheme);
      await stubChildrenApi(page);
      await stubNotificationsApi(page);
      await page.goto("/children");

      await expect(page.locator('[role="status"][aria-live="polite"]')).toHaveCount(1);
      const bell = page.getByRole("button", { name: `Notifications, ${UNREAD_COUNT} non lues` });
      await bell.focus();
      await page.keyboard.press("Enter");

      const center = page.getByRole("dialog", { name: "Notifications" });
      await expect(center).toHaveAttribute("data-slot", SURFACE[width] ?? "");
      await expect(
        center.getByText("Rappel · Marie-Charlotte Delacroix-Beaumont de la : Exercices page 42"),
      ).toBeVisible();
      expect(await center.evaluate((el) => el.contains(document.activeElement))).toBe(true);
      await expect(center.getByRole("heading", { name: "Aujourd'hui" })).toBeVisible();
      await expect(center.getByRole("heading", { name: "Hier" })).toBeVisible();

      for (const key of [...Array(12).fill("Tab"), ...Array(12).fill("Shift+Tab")]) {
        await page.keyboard.press(key);
        const contained = await center.evaluate((el) => el.contains(document.activeElement));
        expect(contained, `focus escaped the notification center on ${key}`).toBe(true);
      }
      expect(await blockingViolations(page)).toEqual([]);

      await page.keyboard.press("Escape");
      await expect(center).toBeHidden();
      await expect(bell).toBeFocused();
    });
  }
}

test("notification center says calmly that nothing is new", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubChildrenApi(page);
  await stubNotificationsApi(page, true);
  await page.goto("/children");

  await page.getByRole("button", { name: "Notifications", exact: true }).click();

  const center = page.getByRole("dialog", { name: "Notifications" });
  await expect(center.getByText("Rien de nouveau")).toBeVisible();
  await expect(center.getByRole("button", { name: "Tout marquer comme lu" })).toHaveCount(0);
  expect(await blockingViolations(page)).toEqual([]);
});

test("the app icon shows the unread count of the server, the same as the bell", async ({
  page,
}) => {
  const badge = await recordBadge(page);
  await stubChildrenApi(page);
  await stubNotificationsApi(page);
  await page.goto("/children");

  await expect(
    page.getByRole("button", { name: `Notifications, ${UNREAD_COUNT} non lues` }),
  ).toBeVisible();
  await expect.poll(badge).toBe(UNREAD_COUNT);
});
