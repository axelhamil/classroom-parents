import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

type Violation = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

export const COLOR_SCHEMES = ["light", "dark"] as const;

export interface AuditedPage {
  readonly name: string;
  readonly path: string;
  readonly prepare?: (page: Page) => Promise<void>;
}

function formatViolation(violation: Violation): string {
  const targets = violation.nodes.map((node) => node.target.join(" ")).join(", ");
  return `${violation.id} (${violation.impact}): ${violation.help} → ${targets}`;
}

export async function blockingViolations(page: Page, include?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  const results = await (include ? builder.include(include) : builder).analyze();

  return results.violations
    .filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""))
    .map(formatViolation);
}

// An entrance fade measured halfway reads as a contrast failure of text that is fine
// once shown, and whether axe lands mid-fade depends on how loaded the host is. Waiting
// for every finite animation makes the verdict about the page a reader actually sees.
async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

export async function audit(
  page: Page,
  target: AuditedPage,
  expectedLocale: string,
): Promise<void> {
  await target.prepare?.(page);
  await page.goto(target.path);

  // A gate redirect (missing session, stale policies) renders a page that satisfies
  // every assertion below; without this the suite would audit it and report green.
  await expect(page).toHaveURL(new RegExp(`${target.path}$`));
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("[data-slot=skeleton]")).toHaveCount(0);

  // axe cannot tell that French content is served under lang="en": html-has-lang
  // passes either way. Asserting equality against the locale this run actually seeded
  // (rather than membership in ["en","fr"]) is what makes a stale, never-synced
  // lang="en" fail: a membership check would pass on that bug trivially.
  await expect(page.locator("html")).toHaveAttribute("lang", expectedLocale);

  await settleAnimations(page);
  expect(await blockingViolations(page)).toEqual([]);
}

export async function tabTo(page: Page, target: Locator, maxPresses = 20): Promise<void> {
  for (let i = 0; i < maxPresses; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Target never received focus after ${maxPresses} Tab presses`);
}
