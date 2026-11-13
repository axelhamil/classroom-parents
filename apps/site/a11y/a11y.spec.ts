import { type AuditedPage, audit, COLOR_SCHEMES, tabTo } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";

const PAGES: readonly AuditedPage[] = [
  { name: "landing", path: "/" },
  { name: "not found", path: "/no-such-page" },
];

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(`site pages (${colorScheme})`, () => {
    test.use({ colorScheme, reducedMotion: "reduce" });
    test.beforeEach(({ page }) =>
      page.addInitScript((theme) => window.localStorage.setItem("theme", theme), colorScheme),
    );

    for (const target of PAGES) {
      test(target.name, async ({ page }) => {
        await audit(page, target, "fr");
        await expect(page.locator("html")).toHaveClass(
          colorScheme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );
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

test("switches the theme from the keyboard through the shared menu and keeps the choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Thème : Clair" });
  await tabTo(page, toggle);
  await page.keyboard.press("Enter");
  await page.getByRole("menuitemradio", { name: "Sombre" }).press("Enter");

  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByRole("button", { name: "Thème : Sombre" })).toBeFocused();
  expect(await page.evaluate(() => window.localStorage.getItem("theme"))).toBe("dark");
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

  test("dates the sample relative to the reader, never to the build day", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("[data-slot=sample-stack] [data-slot=date-tab]")).toHaveCount(0);
    await expect(page.locator("[data-slot=sample-stack]")).toContainText("Demain, 8 h 30");
  });
});

test("moves the hero entrance with transform and opacity only", async ({ page }) => {
  await page.goto("/");

  const entrance = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .filter((rule) => rule instanceof CSSKeyframesRule && rule.name === "landing-rise")
      .map((rule) => rule.cssText)
      .join(""),
  );

  expect(entrance).toContain("opacity");
  expect(entrance).not.toContain("filter");
});

test("reveals the product sample once its island hydrates", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-slot=landing-visual]")).toHaveAttribute("data-reveal", "shown");
  await expect(page.locator("[data-slot=sample-frame]")).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-slot=sample-stack] [data-slot=date-tab]")).toHaveCount(3);
});
