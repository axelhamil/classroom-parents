import { SEED_EMAIL, SEED_PASSWORD, submitCredentials } from "@packages/test/a11y";
import type { Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  await submitCredentials(page, SEED_EMAIL, SEED_PASSWORD);
  await page.waitForURL(/\/dashboard/);
}
