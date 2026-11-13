import type { COLOR_SCHEMES } from "@packages/test/a11y";
import { THEME_STORAGE_KEY } from "@packages/web-kit/theme/theme-store";
import type { Page } from "@playwright/test";

type ColorScheme = (typeof COLOR_SCHEMES)[number];

export async function showColorScheme(page: Page, colorScheme: ColorScheme): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    THEME_STORAGE_KEY,
    colorScheme,
  ] as const);
}
