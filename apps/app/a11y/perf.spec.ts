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

const DRAG_FRAME_P95_MS = 20;
const LONG_TASK_MS = 50;
const DRAG_STEPS = 6;
const DRAG_INPUT_BUDGET_MS = 100;
const DRAG_MS = 2000;

const TWELVE_TILES = [
  { id: "today", size: "l" },
  { id: "tonight", size: "m" },
  { id: "review", size: "s" },
  { id: "overdue", size: "s" },
  { id: "calendar", size: "xl" },
  { id: `child:${LEA.id}`, size: "m" },
  { id: `child:${MAXIMILIEN.id}`, size: "m" },
  { id: "assessments", size: "m" },
  { id: "documents", size: "m" },
  { id: "notes", size: "m" },
  { id: "progress", size: "s" },
  { id: "outings", size: "s" },
];

declare global {
  interface Window {
    __frames: number[];
    __longTasks: number[];
    __bodyMutations: number;
    __recording: boolean;
  }
}

/**
 * Frame gaps, long tasks and every change inside a tile body, from now on. A body that renders
 * again while a tile is carried shows up as a mutation: the gesture moves frames, never content.
 */
function recordGesture(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.__frames = [];
    window.__longTasks = [];
    window.__bodyMutations = 0;
    window.__recording = true;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    }).observe({ type: "longtask" });
    const bodies = new MutationObserver((records) => {
      window.__bodyMutations += records.length;
    });
    for (const body of document.querySelectorAll(
      "[data-slot=scroll-region], [data-slot=dashboard-panel-body]",
    ))
      bodies.observe(body, { childList: true, subtree: true, characterData: true });
    let last = performance.now();
    const tick = (now: number) => {
      window.__frames.push(now - last);
      last = now;
      if (window.__recording) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function percentile(values: number[], rank: number): number {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * rank))] ?? 0;
}

test.describe("arranging the home", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test(`carries a tile ${DRAG_STEPS} cells at full frame rate on a 4x slower CPU`, async ({
    page,
  }) => {
    await serveFamily(page, {
      children: [LEA, MAXIMILIEN],
      events: FIXTURES,
      homeLayout: TWELVE_TILES,
    });
    await observeInteractions(page);
    await page.goto("/");
    await expect(page.locator("[data-block][data-size]")).toHaveCount(TWELVE_TILES.length);
    await page.getByRole("button", { name: "Modifier l'accueil" }).click();
    const grid = page.locator(".react-grid-layout");
    await expect(grid).toBeVisible();
    await page.waitForTimeout(500);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    const grip = page.locator(
      "[data-block=review] [data-slot=dashboard-tile-toolbar] [data-slot=dashboard-panel-title]",
    );
    const gripBox = await grip.boundingBox();
    const cellBox = await page.locator("[data-block=review]").boundingBox();
    if (!gripBox || !cellBox) throw new Error("The tile has no box.");

    const start = { x: gripBox.x + gripBox.width / 2, y: gripBox.y + gripBox.height / 2 };
    const before = await page
      .locator("[data-block][data-size]")
      .evaluateAll((tiles) => tiles.map((tile) => (tile as HTMLElement).dataset.block));
    const seen = await page.evaluate(() => window.__interactions.length);
    await recordGesture(page);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const moves = Math.round(DRAG_MS / 16);
    for (let move = 1; move <= moves; move++) {
      const progress = move / moves;
      await page.mouse.move(
        start.x - cellBox.width * DRAG_STEPS * progress * 0.5,
        start.y + cellBox.height * 0.6 * Math.sin(progress * Math.PI),
      );
      await page.waitForTimeout(16);
    }
    const carried = await page.evaluate(() => window.__bodyMutations);
    await page.mouse.up();
    await page.waitForTimeout(600);
    const inputMs = await page.evaluate(
      (from) => Math.max(0, ...window.__interactions.slice(from).map((entry) => entry.duration)),
      seen,
    );
    const figures = await page.evaluate(() => {
      window.__recording = false;

      return { frames: window.__frames.slice(2), longTasks: window.__longTasks };
    });
    const after = await page
      .locator("[data-block][data-size]")
      .evaluateAll((tiles) => tiles.map((tile) => (tile as HTMLElement).dataset.block));

    const drag = {
      frames: figures.frames.length,
      p95FrameMs: Math.round(percentile(figures.frames, 0.95) * 10) / 10,
      longestTaskMs: Math.round(Math.max(0, ...figures.longTasks)),
      bodyMutations: carried,
      inputMs: Math.round(inputMs),
      moved: before.join() !== after.join(),
    };
    console.log(JSON.stringify({ drag }, null, 2));
    if (process.env.PERF_OUT)
      writeFileSync(
        process.env.PERF_OUT.replace(/\.json$/, "-drag.json"),
        JSON.stringify(drag, null, 2),
      );

    expect(drag.moved).toBe(true);
    expect(drag.p95FrameMs).toBeLessThanOrEqual(DRAG_FRAME_P95_MS);
    expect(drag.longestTaskMs).toBeLessThanOrEqual(LONG_TASK_MS);
    expect(drag.bodyMutations).toBe(0);
    expect(drag.inputMs).toBeLessThan(DRAG_INPUT_BUDGET_MS);
  });
});
