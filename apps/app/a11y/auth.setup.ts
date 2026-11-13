import { existsSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { STORAGE_STATE } from "./playwright.config";
import { markToursSeen, openSignedIn } from "./tour";

setup("authenticate with the seeded session", async ({ browser }) => {
  if (!existsSync(STORAGE_STATE)) {
    throw new Error(`No seeded session at ${STORAGE_STATE}: run pnpm --filter api db:seed first`);
  }

  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  await stubChildrenApi(page);

  const userId = await openSignedIn(page, "/");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator("main")).toBeVisible();
  await markToursSeen(page, userId);

  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
