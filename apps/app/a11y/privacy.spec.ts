import { blockingViolations } from "@packages/test/a11y";
import { expect, test } from "./csp";
import { STORAGE_STATE } from "./playwright.config";

test.describe("privacy pages on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  test("the privacy settings state Limited Use, name Anthropic and offer the export", async ({
    page,
  }) => {
    await page.goto("/settings/privacy");
    await page.getByRole("button", { name: "En savoir plus" }).click();

    const main = page.locator("main");
    await expect(main).toContainText("Limited Use");
    await expect(main).toContainText("Anthropic");
    await expect(page.getByRole("button", { name: "Exporter" })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await blockingViolations(page)).toEqual([]);
  });

  test("the privacy policy states Limited Use, names Anthropic and offers no export", async ({
    page,
  }) => {
    await page.goto("/legal/privacy-policy");

    const main = page.locator("main");
    await expect(main).toContainText("Limited Use");
    await expect(main).toContainText("Anthropic");
    await expect(main).not.toContainText(/export/i);
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await blockingViolations(page)).toEqual([]);
  });
});
