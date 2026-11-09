import { describe, expect, it } from "bun:test";
import {
  EMAIL_SEND_TIMEOUT_SECONDS,
  EMAIL_SETTLE_MARGIN_SECONDS,
} from "@packages/email/email-timing";
import { OUTBOX_SETTLE_MARGIN_SECONDS } from "@packages/outbox/outbox-relay";
import { z } from "zod";
import { frontOrigins, validateEnvBounds, validateHostsEnv } from "../env-bounds";

// Exercises the real guard (`superRefine` in env.ts) against plain literals. Never
// imports `env.ts` itself, since env.ts parses `process.env` at import time and throws
// on a missing `DATABASE_URL` and friends. No `.env` required for this file.
const boundsSchema = z
  .object({
    SHUTDOWN_GRACE_PERIOD_MS: z.number(),
    SHUTDOWN_STEP_TIMEOUT_MS: z.number(),
    SHUTDOWN_WORKERS_TIMEOUT_MS: z.number(),
    SHUTDOWN_DEADLINE_MS: z.number(),
    OUTBOX_LEASE_SECONDS: z.number(),
    OUTBOX_HANDLER_BUDGET_SECONDS: z.number(),
    EMAIL_LEASE_SECONDS: z.number(),
    EMAIL_DEAD_RETRY_HOURS: z.number(),
    EMAIL_DEAD_REPLAY_WINDOW_HOURS: z.number(),
  })
  .superRefine(validateEnvBounds);

const SHUTDOWN_DEFAULTS = {
  SHUTDOWN_GRACE_PERIOD_MS: 15_000,
  SHUTDOWN_STEP_TIMEOUT_MS: 2_000,
  SHUTDOWN_WORKERS_TIMEOUT_MS: 12_000,
  SHUTDOWN_DEADLINE_MS: 36_000,
};

const QUEUE_DEFAULTS = {
  OUTBOX_LEASE_SECONDS: 120,
  OUTBOX_HANDLER_BUDGET_SECONDS: 30,
  EMAIL_LEASE_SECONDS: 120,
  EMAIL_DEAD_RETRY_HOURS: 6,
  EMAIL_DEAD_REPLAY_WINDOW_HOURS: 24,
};

describe("validateEnvBounds", () => {
  it("accepts the defaults", () => {
    const result = boundsSchema.safeParse({
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a shutdown deadline equal to the worst case and rejects one millisecond less", () => {
    const sweepBounds = {};
    const worstCaseMs = 15_000 + 1_000 + 2_000 + 12_000 + 2_000 + 2_000 + 500 + 1_000;

    const atBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs,
    });
    const belowBudget = boundsSchema.safeParse({
      ...sweepBounds,
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
      SHUTDOWN_DEADLINE_MS: worstCaseMs - 1,
    });

    expect(atBudget.success).toBe(true);
    expect(belowBudget.success).toBe(false);
  });

  it("rejects an outbox lease that leaves no settle margin after one handler budget and accepts the exact margin", () => {
    const bounds = {
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };

    const withMargin = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30 + OUTBOX_SETTLE_MARGIN_SECONDS,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });
    const equalToBudget = boundsSchema.safeParse({
      ...bounds,
      OUTBOX_LEASE_SECONDS: 30,
      OUTBOX_HANDLER_BUDGET_SECONDS: 30,
    });

    expect(withMargin.success).toBe(true);
    expect(equalToBudget.success).toBe(false);
  });

  it("rejects an email replay window that closes before the first dead replay is due", () => {
    const bounds = {
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };

    const longer = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 7 });
    const equal = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 6 });

    expect(longer.success).toBe(true);
    expect(equal.success).toBe(false);
  });

  it("rejects an email replay window that outlives the provider's idempotency key", () => {
    const bounds = {
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };

    const day = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 24 });
    const longer = boundsSchema.safeParse({ ...bounds, EMAIL_DEAD_REPLAY_WINDOW_HOURS: 25 });

    expect(day.success).toBe(true);
    expect(longer.success).toBe(false);
  });

  it("rejects an email lease shorter than one send timeout plus the settle margin", () => {
    const bounds = {
      ...SHUTDOWN_DEFAULTS,
      ...QUEUE_DEFAULTS,
    };
    const floor = EMAIL_SEND_TIMEOUT_SECONDS + EMAIL_SETTLE_MARGIN_SECONDS;

    const atFloor = boundsSchema.safeParse({ ...bounds, EMAIL_LEASE_SECONDS: floor });
    const below = boundsSchema.safeParse({ ...bounds, EMAIL_LEASE_SECONDS: floor - 1 });

    expect(atFloor.success).toBe(true);
    expect(below.success).toBe(false);
  });
});

describe("validateHostsEnv", () => {
  const schema = z
    .object({
      APP_ORIGIN: z.string(),
      BETTER_AUTH_URL: z.string(),
      COOKIE_DOMAIN: z.string().optional(),
    })
    .superRefine(validateHostsEnv);
  it.each([
    ["fly.dev", "https://app.fly.dev", "https://api.fly.dev"],
    ["co.uk", "https://app.example.co.uk", "https://api.example.co.uk"],
  ])("refuses the public suffix %s as a cookie domain", (domain, APP_ORIGIN, BETTER_AUTH_URL) => {
    const parsed = schema.safeParse({ APP_ORIGIN, BETTER_AUTH_URL, COOKIE_DOMAIN: domain });

    expect(parsed.error?.issues[0]?.message).toContain("public suffix");
  });

  const hosts = {
    APP_ORIGIN: "https://app.example.com",
    BETTER_AUTH_URL: "https://api.example.com",
  };

  it("accepts a parent domain of every host", () => {
    expect(schema.safeParse({ ...hosts, COOKIE_DOMAIN: "example.com" }).success).toBe(true);
  });

  it("accepts no cookie domain", () => {
    expect(schema.safeParse(hosts).success).toBe(true);
  });

  it.each([
    [
      "two railway sub-domains",
      "https://classroom-app.up.railway.app",
      "https://classroom-api.up.railway.app",
    ],
    ["two unrelated domains", "https://app.example.com", "https://api.other.com"],
    ["localhost against an ip", "http://localhost:5173", "http://127.0.0.1:3000"],
  ])("refuses app and api on different sites: %s", (_label, APP_ORIGIN, BETTER_AUTH_URL) => {
    const parsed = schema.safeParse({ APP_ORIGIN, BETTER_AUTH_URL });

    expect(parsed.error?.issues[0]?.path).toEqual(["BETTER_AUTH_URL"]);
  });

  it.each([
    ["sub-domains of one site", "https://app.example.com", "https://api.example.com"],
    ["localhost on two ports", "http://localhost:5173", "http://localhost:3000"],
  ])("accepts app and api on the same site: %s", (_label, APP_ORIGIN, BETTER_AUTH_URL) => {
    expect(schema.safeParse({ APP_ORIGIN, BETTER_AUTH_URL }).success).toBe(true);
  });

  it.each([
    ["a host outside the parent", { COOKIE_DOMAIN: "other.example" }],
    ["a suffix that is not a parent", { COOKIE_DOMAIN: "ample.com" }],
    ["a leading dot", { COOKIE_DOMAIN: ".example.com" }],
    ["a bare top-level name", { COOKIE_DOMAIN: "localhost" }],
  ])("refuses %s", (_label, override) => {
    expect(schema.safeParse({ ...hosts, ...override }).success).toBe(false);
  });
});

describe("frontOrigins", () => {
  it("keeps the local fallback without any configuration", () => {
    expect(frontOrigins({})).toEqual(["http://localhost:5173"]);
  });
});
