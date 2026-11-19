import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./csp";
import {
  EVENTS,
  inDays,
  LEA,
  MAXIMILIEN,
  REVIEW_EVENT,
  serveFamily,
  todayAt,
} from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";

/*
 * The page clock is pinned, which freezes `performance.now()` too: interactions are told
 * apart by their order in the buffer, never by their timestamp.
 *
 * Field budgets of the home, measured on the preview build with the API stubbed:
 * Fast 4G (9 Mbps down, 1.5 Mbps up, 165 ms RTT) for the load, a 4x slower CPU for
 * the interactions. Run on demand (`pnpm --filter app check:perf`), never in CI: a
 * shared runner's timings would turn the gate into noise. `PERF_OUT` writes the
 * figures as JSON.
 */
const LCP_BUDGET_MS = 2000;
const INP_BUDGET_MS = 200;
const CPU_SLOWDOWN = 4;
const FAST_4G = {
  offline: false,
  latency: 165,
  downloadThroughput: (9 * 1024 * 1024) / 8,
  uploadThroughput: (1.5 * 1024 * 1024) / 8,
};

const WEEK = Array.from({ length: 18 }, (_, index) => ({
  ...REVIEW_EVENT,
  id: `9e0f1a2b-3c4d-4e5f-8a6b-${String(index).padStart(12, "0")}`,
  childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
  title: `Devoir ${index + 1} : exercices du chapitre ${index + 3}`,
  category: index % 3 === 0 ? "assessment" : "homework",
  status: "confirmed",
  deadlineDate: inDays(index % 6),
  deadlineAt: `${inDays(index % 6)}T07:00:00.000Z`,
}));
const FIXTURES = [...EVENTS, ...WEEK];

interface Figures {
  scripts: { files: number; rawBytes: number; gzipBytes: number; largest: string[] };
  styles: { rawBytes: number; gzipBytes: number };
  lcpMs: number;
  inpMs: Record<string, number>;
}

declare global {
  interface Window {
    __interactions: { duration: number }[];
  }
}

async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", FAST_4G);

  return cdp;
}

function observeInteractions(page: Page) {
  return page.addInitScript(() => {
    window.__interactions = [];
    const everyInteraction = { type: "event", durationThreshold: 16, buffered: true };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry instanceof PerformanceEventTiming && entry.interactionId)
          window.__interactions.push({ duration: entry.duration });
    }).observe(everyInteraction);
  });
}

async function interactionLatency(page: Page, act: () => Promise<void>): Promise<number> {
  const seen = await page.evaluate(() => window.__interactions.length);
  await act();
  await page.waitForTimeout(600);

  return page.evaluate(
    (from) => Math.max(0, ...window.__interactions.slice(from).map((entry) => entry.duration)),
    seen,
  );
}

function largestContentfulPaint(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1]?.startTime ?? 0);
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }),
  );
}

function sizeOf(bodies: Buffer[]) {
  return {
    rawBytes: bodies.reduce((sum, body) => sum + body.length, 0),
    gzipBytes: bodies.reduce((sum, body) => sum + gzipSync(body).length, 0),
  };
}

test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 }, hasTouch: false });

test("the home loads and answers within its budgets on a phone", async ({ page }) => {
  await page.clock.setFixedTime(todayAt("09:00"));
  await serveFamily(page, { children: [LEA, MAXIMILIEN], events: FIXTURES });
  await page.route("**/events/*", (route) => {
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const event = FIXTURES.find((candidate) => candidate.id === id);

    return event ? route.fulfill({ json: event }) : route.fallback();
  });
  await page.route("**/events/*/done", (route) => route.fulfill({ json: { done: true } }));
  await observeInteractions(page);

  const scripts: Buffer[] = [];
  const names: { name: string; bytes: number }[] = [];
  const styles: Buffer[] = [];
  page.on("response", async (response) => {
    const type = response.request().resourceType();
    if (type !== "script" && type !== "stylesheet") return;

    const body = await response.body().catch(() => null);
    if (!body) return;

    (type === "script" ? scripts : styles).push(body);
    names.push({ name: new URL(response.url()).pathname, bytes: gzipSync(body).length });
  });

  const cdp = await throttle(page);
  await page.goto("/");
  await expect(page.locator("[data-slot=calendar-entry-link]").first()).toBeVisible();
  await page.waitForTimeout(1000);
  const lcpMs = await largestContentfulPaint(page);
  const home = {
    scripts: {
      files: scripts.length,
      ...sizeOf(scripts),
      largest: names
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 15)
        .map(({ name, bytes }) => `${name} ${bytes}`),
    },
    styles: sizeOf(styles),
  };

  await cdp.send("Network.emulateNetworkConditions", { ...FAST_4G, latency: 0 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  const openDrawer = await interactionLatency(page, async () => {
    await page.locator("[data-slot=calendar-entry-link]").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const tick = await interactionLatency(page, () =>
    page.locator("[data-slot=calendar-entry] [data-slot=checkbox]").first().click(),
  );

  const changeWeek = await interactionLatency(page, () =>
    page.getByRole("button", { name: "Période suivante" }).click(),
  );

  const figures: Figures = {
    ...home,
    lcpMs: Math.round(lcpMs),
    inpMs: {
      openDrawer: Math.round(openDrawer),
      tick: Math.round(tick),
      changeWeek: Math.round(changeWeek),
    },
  };
  console.log(JSON.stringify(figures, null, 2));
  if (process.env.PERF_OUT) writeFileSync(process.env.PERF_OUT, JSON.stringify(figures, null, 2));

  expect(figures.lcpMs).toBeLessThan(LCP_BUDGET_MS);
  for (const latency of Object.values(figures.inpMs)) expect(latency).toBeLessThan(INP_BUDGET_MS);
});
