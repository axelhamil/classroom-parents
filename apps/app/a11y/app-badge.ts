import type { Page } from "@playwright/test";

/** Records what the app sets on its icon badge, read back by the returned probe (null before any). */
export async function recordBadge(page: Page): Promise<() => Promise<number | null>> {
  await page.addInitScript(() => {
    const shown = { count: null as number | null };
    Object.assign(window, { shownBadge: shown });
    Object.assign(navigator, {
      setAppBadge: async (count: number) => {
        shown.count = count;
      },
      clearAppBadge: async () => {
        shown.count = 0;
      },
    });
  });

  return () =>
    page.evaluate(() => {
      const shown = Reflect.get(window, "shownBadge");

      return typeof shown?.count === "number" ? shown.count : null;
    });
}
