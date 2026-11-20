import { existsSync, readFileSync } from "node:fs";
import type { Response } from "@playwright/test";
import { stubChildrenApi } from "./children-fixture";
import { expect, test as setup } from "./csp";
import { STORAGE_STATE } from "./playwright.config";
import { markToursSeen, openSignedIn } from "./tour";

const API_PACKAGE = new URL("../../api/package.json", import.meta.url);
const GATE_WINDOWS = { 60: "RATE_LIMIT_GLOBAL_PER_MINUTE", 3600: "RATE_LIMIT_GLOBAL_PER_HOUR" };

function gateBudget(variable: string): number {
  const script = JSON.parse(readFileSync(API_PACKAGE, "utf8")).scripts["start:gate"];
  const value = new RegExp(`${variable}=(\\d+)`).exec(String(script))?.[1];
  if (!value) throw new Error(`start:gate no longer sets ${variable}: update auth.setup.ts`);

  return Number(value);
}

function globalBudgets(policy: string): Map<number, number> {
  const windows = [...policy.matchAll(/"global";q=(\d+);w=(\d+)/g)];

  return new Map(windows.map(([, quota, window]) => [Number(window), Number(quota)]));
}

// Every browser of the sweep signs in as the one seeded parent: an API started without
// `start:gate` (a `pnpm dev` left running, reused by `reuseExistingServer`) refuses that parent
// with 429s halfway through, and the failures look like broken pages.
function expectGateApi(session: Response): void {
  const budgets = globalBudgets(session.headers()["ratelimit-policy"] ?? "");
  const short = Object.entries(GATE_WINDOWS).filter(
    ([window, variable]) => (budgets.get(Number(window)) ?? 0) < gateBudget(variable),
  );
  if (short.length === 0) return;

  const api = new URL(session.url()).origin;
  const seen = [...budgets].map(([window, quota]) => `${quota} per ${window}s`).join(", ");
  const needed = short.map(([, variable]) => `${variable}=${gateBudget(variable)}`).join(", ");
  throw new Error(
    `The API at ${api} gives the seeded parent ${seen || "no advertised budget"}, below what the gate needs (${needed}): stop it and start it with \`pnpm --filter api start:gate\`.`,
  );
}

setup("authenticate with the seeded session", async ({ browser }) => {
  if (!existsSync(STORAGE_STATE)) {
    throw new Error(`No seeded session at ${STORAGE_STATE}: run pnpm --filter api db:seed first`);
  }

  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  await stubChildrenApi(page);

  const session = page.waitForResponse((response) =>
    response.url().endsWith("/api/auth/get-session"),
  );
  const userId = await openSignedIn(page, "/");
  expectGateApi(await session);
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(page.locator("main")).toBeVisible();
  await markToursSeen(page, userId);

  await context.storageState({ path: STORAGE_STATE });
  await context.close();
});
