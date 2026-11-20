import type { Page } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { expect, test } from "./csp";
import { EVENTS, LEA, MAXIMILIEN, REVIEW_EVENT, serveFamily } from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";
import { visualSystemOffenders } from "./visual-system";

interface Screen {
  name: string;
  path: string;
  prepare?: (page: Page) => Promise<unknown>;
  ready: (page: Page) => Promise<void>;
}

const serveAgenda = (page: Page) =>
  serveFamily(page, { children: [LEA, MAXIMILIEN], events: [...EVENTS, REVIEW_EVENT] });

const SCREENS: readonly Screen[] = [
  {
    name: "home",
    path: "/",
    prepare: serveAgenda,
    ready: (page) => expect(page.locator("[data-slot=dashboard-panel]").first()).toBeVisible(),
  },
  {
    name: "event drawer",
    path: `/events/${REVIEW_EVENT.id}`,
    prepare: serveAgenda,
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toHaveText(REVIEW_EVENT.title),
  },
  {
    name: "children",
    path: "/children",
    prepare: stubChildrenApi,
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    name: "settings",
    path: "/settings",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    name: "onboarding",
    path: "/onboarding",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
];

/**
 * Waits for every timed animation that ends: a sheet still scaling in measures its icons at 19 px.
 * A block that loads later starts its entrance after this wait, so the measure is polled: a size
 * caught mid-entrance settles, a wrong one stays and fails.
 * A scroll-driven one (the scroll region's fade) follows the scroll, not the clock, and never finishes.
 */
function settled(page: Page) {
  return page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.timeline === document.timeline &&
            animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

const WIDTHS = [390, 1440] as const;

for (const width of WIDTHS) {
  test.describe(`visual system at ${width} px`, () => {
    // The phone is touched: a coarse pointer switches every control to its 44 px family.
    test.use({
      storageState: STORAGE_STATE,
      viewport: { width, height: 900 },
      hasTouch: width < 768,
    });

    // Sizes and radii come from tokens no theme overrides, so one colour scheme covers both.
    for (const screen of SCREENS) {
      test(`${screen.name} sizes icons and controls by role and nests its corners`, async ({
        page,
      }) => {
        await screen.prepare?.(page);
        await page.goto(screen.path);
        await screen.ready(page);
        await expect
          .poll(async () => {
            await settled(page);

            return visualSystemOffenders(page);
          })
          .toEqual([]);
      });
    }
  });
}
