import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AppErrorException, Option } from "@packages/ddd-kit";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { ClockReport } from "../../workers/clock";
import { createInternalRoutes } from "../internal-routes/internal.routes";
import { createErrorHandler } from "../middleware/error.middleware";
import { NoOpInstrumentation } from "../services/noop-instrumentation";

const SECRET = "s".repeat(32);

const passing: ClockReport = {
  ok: true,
  durationMs: 5,
  jobs: [{ job: "outbox", ok: true, counts: { dispatched: 1 }, durationMs: 5 }],
};

const failing: ClockReport = {
  ok: false,
  durationMs: 5,
  jobs: [
    { job: "outbox", ok: true, counts: { dispatched: 1 }, durationMs: 5 },
    { job: "sync", ok: false, counts: {}, durationMs: 1, code: "SYNC_CLAIM_FAILED" },
  ],
};

let tick: ReturnType<typeof mock<() => Promise<ClockReport>>>;
let sweep: ReturnType<typeof mock<() => Promise<ClockReport>>>;
let spent: number;

const FAILURE_BUDGET = 2;

const rateLimit: MiddlewareHandler = async (_c, next) => {
  spent += 1;
  if (spent > FAILURE_BUDGET)
    throw new AppErrorException({ code: "CLOCK_RATE_LIMITED", message: "Too many attempts." });
  await next();
};

beforeEach(() => {
  spent = 0;
  tick = mock(async () => passing);
  sweep = mock(async () => passing);
});

function internalApp(cronSecret = Option.some(SECRET)) {
  const app = new Hono().route(
    "/internal",
    createInternalRoutes({
      cronSecret,
      rateLimit,
      clock: { tick, sweep },
    }),
  );
  app.onError(createErrorHandler(new NoOpInstrumentation()));
  return app;
}

function call(path: string, authorization?: string, method = "POST", app = internalApp()) {
  return app.request(path, {
    method,
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe("internal clock routes", () => {
  it("given no clock secret is configured, then the routes do not exist", async () => {
    const response = await internalApp(Option.none()).request("/internal/tick", {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(404);
    expect(tick).not.toHaveBeenCalled();
  });

  it("given no Authorization header, then the clock is refused with a typed 401", async () => {
    const response = await call("/internal/tick");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "CRON_UNAUTHORIZED" } });
    expect(tick).not.toHaveBeenCalled();
  });

  it("given a wrong secret, then the clock is refused with a typed 401", async () => {
    const response = await call("/internal/tick", `Bearer ${"x".repeat(32)}`);

    expect(response.status).toBe(401);
    expect(tick).not.toHaveBeenCalled();
  });

  it("given the right secret, then one tick runs and its report is returned", async () => {
    const response = await call("/internal/tick", `Bearer ${SECRET}`, "GET");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(passing);
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("given a job of the tick failed, then the answer is not 2xx and still reports every job", async () => {
    tick.mockResolvedValue(failing);

    const response = await call("/internal/tick", `Bearer ${SECRET}`);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(failing);
  });

  it("given the right secret on the sweep route, then one sweep pass runs", async () => {
    const response = await call("/internal/sweep", `Bearer ${SECRET}`);

    expect(response.status).toBe(200);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
  });

  it("given repeated wrong secrets, then they are throttled once their budget is spent", async () => {
    const app = internalApp();
    const statuses: number[] = [];
    for (let i = 0; i <= FAILURE_BUDGET; i++)
      statuses.push((await call("/internal/tick", "Bearer wrong", "POST", app)).status);

    expect(statuses).toEqual([401, 401, 429]);
  });

  it("given others spent the failure budget, then a call with the right secret still runs", async () => {
    const app = internalApp();
    for (let i = 0; i <= FAILURE_BUDGET; i++)
      await call("/internal/tick", "Bearer wrong", "POST", app);

    const response = await call("/internal/tick", `Bearer ${SECRET}`, "POST", app);

    expect(response.status).toBe(200);
    expect(tick).toHaveBeenCalledTimes(1);
  });
});
