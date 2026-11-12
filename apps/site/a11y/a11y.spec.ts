import { type AuditedPage, audit, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";

const PAGES: readonly AuditedPage[] = [
  { name: "landing", path: "/" },
  { name: "not found", path: "/no-such-page" },
];

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(`site pages (${colorScheme})`, () => {
    test.use({ colorScheme, reducedMotion: "reduce" });

    for (const target of PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, "fr");
      });
    }
  });
}

test("reaches the sign in call to action with the keyboard, pointing at the app", async ({
  page,
}) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Continuer avec Google" }).first();
  await tabTo(page, cta);
  await expect(cta).toBeFocused();
  await expect(cta).toHaveAttribute("href", /\/login\?start=google$/);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("shows the product sample in its final state", async ({ page }) => {
    await page.goto("/");

    const frame = page.locator("[data-slot=sample-frame]");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-slot=notification-preview]")).toHaveCSS("opacity", "1");
    await expect(page.locator("[data-slot=sample-stack] > li").first()).toHaveCSS("opacity", "1");
  });
});

test("reveals the product sample once its island hydrates", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-slot=landing-visual]")).toHaveAttribute("data-reveal", "shown");
  await expect(page.locator("[data-slot=sample-frame]")).toHaveCSS("opacity", "1");
});
