import { describe, expect, it, mock } from "bun:test";
import type { CalendarFeedError } from "@modules/calendar-feed/application/ports/calendar-feed-repository.port";
import { createCalendarRoutes } from "@modules/calendar-feed/infrastructure/http/calendar.routes";
import { Option, Result } from "@packages/ddd-kit";
import { mockInstrumentation } from "@packages/test/bun/instrumentation";
import { Hono } from "hono";

let callerIp = "203.0.113.7";

const realHonoBun = await import("hono/bun");
mock.module("hono/bun", () => ({
  ...realHonoBun,
  getConnInfo: () => ({ remote: { address: callerIp } }),
}));

const realLogger = await import("../logger");
const quiet = () => {};
mock.module("../logger", () => ({
  ...realLogger,
  logger: { warn: quiet, info: quiet, error: quiet, debug: quiet },
}));

const { calendarFeedRateLimit, globalRateLimit } = await import(
  "../middleware/calendar-rate-limit"
);
const { createErrorHandler } = await import("../middleware/error.middleware");
const { RateLimiterFlexibleAdapter, memoryFactory } = await import(
  "../services/rate-limiter-flexible.adapter"
);

interface Requester {
  request: (path: string) => Response | Promise<Response>;
}

const GLOBAL_BURST = 300;
const MISS_BUDGET = 300;

const feeds = {
  render: async (secret: string) =>
    Result.ok<Option<string>, CalendarFeedError>(
      secret.startsWith("live") ? Option.some("BEGIN:VCALENDAR") : Option.none<string>(),
    ),
};

function apiWithFreshLimiter() {
  const limiter = new RateLimiterFlexibleAdapter(mockInstrumentation(), memoryFactory);
  return new Hono<{ Variables: { user: null } }>()
    .use("*", async (c, next) => {
      c.set("user", null);
      await next();
    })
    .use("*", globalRateLimit({ limiter }))
    .get("/me", (c) => c.json({ ok: true }))
    .route(
      "/calendar",
      createCalendarRoutes({
        calendarFeedRateLimit: calendarFeedRateLimit({ limiter }),
        CalendarFeedService: feeds,
      }),
    )
    .onError(createErrorHandler(mockInstrumentation()));
}

async function statusesOf(api: Requester, paths: string[]): Promise<number[]> {
  const statuses: number[] = [];
  for (const path of paths) statuses.push((await api.request(path)).status);
  return statuses;
}

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

describe("calendar feed rate limits", () => {
  it("given one calendar server polling many live links from one address, then every fetch is served past the global ceiling", async () => {
    callerIp = "203.0.113.7";
    const api = apiWithFreshLimiter();

    const statuses = await statusesOf(
      api,
      range(GLOBAL_BURST + 100).map((i) => `/calendar/live-${i}.ics`),
    );

    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it("given the same address on another route, then the global ceiling still applies", async () => {
    callerIp = "203.0.113.8";
    const api = apiWithFreshLimiter();

    const statuses = await statusesOf(
      api,
      range(GLOBAL_BURST + 1).map(() => "/me"),
    );

    expect(statuses.at(-1)).toBe(429);
  });

  it("given one address naming unknown links again and again, then it is refused with 429 once its miss budget is spent, live links included", async () => {
    callerIp = "198.51.100.9";
    const api = apiWithFreshLimiter();

    const misses = await statusesOf(
      api,
      range(MISS_BUDGET).map((i) => `/calendar/guess-${i}.ics`),
    );
    const afterwards = await statusesOf(api, ["/calendar/guess-x.ics", "/calendar/live-1.ics"]);

    expect(misses.every((status) => status === 404)).toBe(true);
    expect(afterwards).toEqual([429, 429]);
  });

  it("given another address, then the guesser's spent budget does not touch it", async () => {
    const api = apiWithFreshLimiter();
    callerIp = "198.51.100.10";
    await statusesOf(
      api,
      range(MISS_BUDGET).map((i) => `/calendar/guess-${i}.ics`),
    );

    callerIp = "198.51.100.11";
    const statuses = await statusesOf(api, ["/calendar/guess-x.ics", "/calendar/live-1.ics"]);

    expect(statuses).toEqual([404, 200]);
  });
});
