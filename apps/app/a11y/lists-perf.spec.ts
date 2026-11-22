import { writeFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./csp";
import {
  AGENDA_WITHOUT_OVERDUE_BLOCK,
  inDays,
  LEA,
  MAXIMILIEN,
  REVIEW_EVENT,
  TODAY,
  todayAt,
} from "./events-fixtures";
import { STORAGE_STATE } from "./playwright.config";
import { type Block, inCases } from "./served-layout";

/*
 * Every list of the app measured with a family that has piled up 500 deadlines over a
 * school year: 150 days behind, 150 ahead, most of the past done, a fortnight with some
 * still late, a few dates to check. The API is stubbed with the filters the server applies
 * (period, scope, status, cursor), so each screen holds what it would hold for that family.
 * Interactions run on a 4x slower CPU. On demand (`pnpm --filter app check:perf`), never in
 * CI; `LISTS_PERF_OUT` writes the figures as JSON.
 */
const DEADLINES = Number(process.env.LISTS_DEADLINES ?? 500);
const SPAN_DAYS = 300;
const CPU_SLOWDOWN = 4;
const PAGE_SIZE = 50;
const LATE_WINDOW_DAYS = 14;
const REVIEW_ALL = process.env.LISTS_REVIEW_ALL === "1";

const FAMILY = [LEA, { ...MAXIMILIEN, status: "connected", cause: undefined }];

function deadlineAt(index: number) {
  const offset = Math.floor((index * SPAN_DAYS) / DEADLINES) - SPAN_DAYS / 2;
  const date = inDays(offset);
  const past = offset < 0;
  const recent = past && offset >= -LATE_WINDOW_DAYS;

  return {
    ...REVIEW_EVENT,
    id: `7e1f2a3b-4c5d-4e6f-8a7b-${String(index).padStart(12, "0")}`,
    childId: index % 2 === 0 ? LEA.id : MAXIMILIEN.id,
    title:
      index % 7 === 0
        ? `Sortie scolaire ${index} : autorisation signée, pique-nique et gourde à prévoir`
        : `Exercices ${index % 12} à ${(index % 12) + 5} page ${100 + (index % 80)}`,
    category: ["homework", "assessment", "school_trip", "document_due"][index % 4],
    status: !past && (REVIEW_ALL || index % 10 === 3) ? "needs_review" : "confirmed",
    deadlineDate: date,
    deadlineAt: `${date}T07:00:00.000Z`,
    done: past && (recent ? index % 5 < 2 : index % 7 !== 0),
  };
}

/** The late deadlines open as a list from the Agenda only while the "En retard" block is hidden. */
const HOME_WITH_THE_LATE_LINE: Block[] = [
  { id: "review", size: { w: 2, h: 1 } },
  ...AGENDA_WITHOUT_OVERDUE_BLOCK,
];

const ALL = Array.from({ length: DEADLINES }, (_, index) => deadlineAt(index));
type Deadline = (typeof ALL)[number];

function pageOf(items: Deadline[], cursor: string | null, limit: number) {
  const from = Number(cursor ?? 0);
  const next = from + limit;

  return { items: items.slice(from, next), nextCursor: next < items.length ? String(next) : null };
}

function answer(route: Route): Promise<void> {
  const url = new URL(route.request().url());
  const query = url.searchParams;
  const path = url.pathname;
  const child = query.get("childId");
  const scoped = ALL.filter((event) => !child || event.childId === child);

  if (path === "/children") return route.fulfill({ json: FAMILY });
  if (path === "/home/layout")
    return route.fulfill({ json: { v: 3, blocks: inCases(HOME_WITH_THE_LATE_LINE), revision: 1 } });
  if (path === "/sync") return route.fulfill({ status: 202, json: { status: "requested" } });
  if (path === "/events/calendar") {
    const from = query.get("from") ?? "";
    const to = query.get("to") ?? "";
    return route.fulfill({
      json: {
        items: ALL.filter((event) => event.deadlineDate >= from && event.deadlineDate <= to),
      },
    });
  }
  if (path === "/events") {
    const status = query.get("status");
    const upcoming = query.get("scope") !== "history";
    const items = scoped
      .filter((event) => (upcoming ? event.deadlineDate >= TODAY : event.deadlineDate < TODAY))
      .filter((event) => !status || event.status === status)
      .sort((a, b) =>
        upcoming
          ? a.deadlineDate.localeCompare(b.deadlineDate)
          : b.deadlineDate.localeCompare(a.deadlineDate),
      );
    const limit = Number(query.get("limit") ?? PAGE_SIZE);
    return route.fulfill({ json: pageOf(items, query.get("cursor"), limit) });
  }
  if (path.endsWith("/reminders"))
    return route.fulfill({ json: { customized: false, reminders: [] } });
  const event = ALL.find((candidate) => path === `/events/${candidate.id}`);
  if (event) return route.fulfill({ json: event });

  return route.fallback();
}

declare global {
  interface Window {
    __interactions: { duration: number }[];
    __frames: number[];
    __recording: boolean;
  }
}

async function interactionLatency(page: Page, act: () => Promise<void>): Promise<number> {
  const seen = await page.evaluate(() => window.__interactions.length);
  await act();
  await page.waitForTimeout(600);

  return Math.round(
    await page.evaluate(
      (from) => Math.max(0, ...window.__interactions.slice(from).map((entry) => entry.duration)),
      seen,
    ),
  );
}

async function scrollFrames(page: Page, over: string, steps: number) {
  await page.locator(over).first().hover();
  await page.evaluate(() => {
    window.__frames = [];
    window.__recording = true;
    let last = performance.now();
    const frame = (now: number) => {
      window.__frames.push(now - last);
      last = now;
      if (window.__recording) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(50);
  }
  const frames = await page.evaluate(() => {
    window.__recording = false;
    return window.__frames.slice(1);
  });
  const sorted = [...frames].sort((a, b) => a - b);

  return {
    frames: frames.length,
    p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    over50Ms: frames.filter((duration) => duration > 50).length,
  };
}

function domNodes(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll("main *, [role=dialog] *").length);
}

test.use({ storageState: STORAGE_STATE, viewport: { width: 390, height: 844 } });

test("every list answers with 500 deadlines on a slow phone", async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.setFixedTime(todayAt("09:00"));
  await page.route("**/*", (route) =>
    route.request().resourceType() === "fetch" ? answer(route) : route.fallback(),
  );
  await page.addInitScript(() => {
    window.__interactions = [];
    const everyInteraction = { type: "event", durationThreshold: 16, buffered: true };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        if (entry instanceof PerformanceEventTiming && entry.interactionId)
          window.__interactions.push({ duration: entry.duration });
    }).observe(everyInteraction);
  });
  const cdp = await page.context().newCDPSession(page);

  await page.goto("/");
  await expect(page.locator("[data-slot=calendar-entry-link]").first()).toBeVisible();
  await page.waitForTimeout(800);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

  const week = { nodes: await domNodes(page), rows: 0, inpMs: 0 };
  week.inpMs = await interactionLatency(page, () =>
    page.getByRole("button", { name: "Période suivante" }).click(),
  );
  week.rows = await page.locator("main [data-slot=calendar-entry]").count();

  const month = { nodes: 0, rows: 0, inpMs: 0, selectDayMs: 0 };
  month.inpMs = await interactionLatency(page, () =>
    page.getByRole("tab", { name: "Mois" }).click(),
  );
  await expect(page.locator("[data-slot=month-planner-day]").first()).toBeVisible();
  month.nodes = await domNodes(page);
  month.rows = await page
    .locator("main [data-slot=month-planner-day] li, main [data-slot=hue-dot]")
    .count();
  month.selectDayMs = await interactionLatency(page, () =>
    page.locator("[data-slot=month-planner-day]").nth(15).click(),
  );
  await page.getByRole("tab", { name: "Semaine" }).click();
  await page.getByRole("button", { name: "Aujourd'hui" }).click();

  const late = { rows: 0, nodes: 0, inpMs: 0 };
  const lateButton = page.getByRole("button", { name: /^En retard, \d+/ });
  late.inpMs = await interactionLatency(page, async () => {
    await lateButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
  late.rows = await page.getByRole("dialog").locator("[data-slot=calendar-entry]").count();
  late.nodes = await domNodes(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  const review = { rows: 0, nodes: 0, inpMs: 0, scroll: {} };
  review.inpMs = await interactionLatency(page, async () => {
    await page
      .getByRole("button", { name: /dates? à vérifier/ })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
  review.rows = await page.getByRole("dialog").locator("[data-slot=list-row]").count();
  review.nodes = await domNodes(page);
  review.scroll = await scrollFrames(page, "[role=dialog] [data-slot=list-row]", 20);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.goto("/?tab=history");
  await expect(page.locator("main li").first()).toBeVisible();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
  const history = { loaded: 0, mountedRows: 0, nodes: 0, moreMs: [] as number[], scroll: {} };
  const more = page.getByRole("button", { name: "Afficher les suivantes" });
  while (await more.isVisible()) {
    history.moreMs.push(await interactionLatency(page, () => more.click()));
    await page.waitForTimeout(300);
  }
  history.loaded = ALL.filter((event) => event.deadlineDate < TODAY).length;
  history.mountedRows = await page.locator("main li").count();
  history.nodes = await domNodes(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  history.scroll = await scrollFrames(page, "main li", 40);

  const figures = { deadlines: DEADLINES, week, month, late, review, history };
  console.log(JSON.stringify(figures, null, 2));
  if (process.env.LISTS_PERF_OUT)
    writeFileSync(process.env.LISTS_PERF_OUT, JSON.stringify(figures, null, 2));
});
