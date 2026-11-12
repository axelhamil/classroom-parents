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
  await expect(cta).toHaveAttribute("href", /\/login$/);
});
