import { blockingViolations } from "@packages/test/a11y";
import { expect, test } from "./csp";
import { STORAGE_STATE } from "./playwright.config";

const PAGES = ["/settings/privacy", "/legal/privacy-policy"];

test.describe("privacy pages on a phone", () => {
  test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

  for (const path of PAGES) {
    test(`${path} states Limited Use, names Anthropic and offers no export`, async ({ page }) => {
      await page.goto(path);

      const main = page.locator("main");
      await expect(main).toContainText("Limited Use");
      await expect(main).toContainText("Anthropic");
      await expect(main).not.toContainText(/export/i);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(await blockingViolations(page)).toEqual([]);
    });
  }
});
