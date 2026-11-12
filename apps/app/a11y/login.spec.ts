import { tabTo } from "@packages/test/a11y";
import { expect, test } from "@playwright/test";

test("signs in with Google only, from one main and one h1, reachable with the keyboard", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByLabel("Mot de passe")).toHaveCount(0);

  const google = page.getByRole("button", { name: "Continuer avec Google" }).first();
  await tabTo(page, google);
  await expect(google).toBeFocused();
});
