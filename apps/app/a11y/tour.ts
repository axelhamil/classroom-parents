import { tourKey } from "@packages/web-kit/tour/tour-store";
import type { Page } from "@playwright/test";
import { z } from "zod";

const SCREENS = ["home", "event-detail", "children", "settings"];

const Session = z.object({ user: z.object({ id: z.string() }) });

export const TOUR_SELECTOR = '[data-slot="tour"]';

export async function openSignedIn(page: Page, path: string): Promise<string> {
  const session = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/get-session"),
  );
  await page.goto(path);

  return Session.parse(await (await session).json()).user.id;
}

export async function markToursSeen(page: Page, userId: string): Promise<void> {
  const keys = SCREENS.map((screen) => tourKey(userId, screen));
  await page.evaluate((seen) => {
    for (const key of seen) localStorage.setItem(key, "true");
  }, keys);
}

export async function forgetTours(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("tours-forgotten")) return;

    sessionStorage.setItem("tours-forgotten", "1");
    for (const key of Object.keys(localStorage))
      if (key.startsWith("tour:")) localStorage.removeItem(key);
  });
}
