import { isIP } from "node:net";
import {
  EMAIL_SEND_TIMEOUT_SECONDS,
  EMAIL_SETTLE_MARGIN_SECONDS,
} from "@packages/email/email-timing";
import { OUTBOX_SETTLE_MARGIN_SECONDS } from "@packages/outbox/outbox-relay";
import { getDomain, getPublicSuffix } from "tldts";
import type { z } from "zod";
import {
  DEADLINE_FLUSH_TIMEOUT_MS,
  GRACE_MARGIN_MS,
  TELEMETRY_FLUSH_MARGIN_MS,
  TELEMETRY_FLUSH_TIMEOUT_MS,
  worstCaseShutdownMs,
} from "./shutdown";

const EMAIL_IDEMPOTENCY_KEY_TTL_HOURS = 24;

/**
 * The shutdown bounds only work when the deadline covers the worst case of every
 * step plus the margins the shutdown adds, and each lease must outlive the work it
 * covers. A `.env` that breaks either silently reproduces the bug its configuration
 * exists to prevent, so it fails the boot instead.
 *
 * Kept out of `env.ts` so tests can exercise the comparisons against plain literals:
 * `env.ts` parses `process.env` at import time and throws on missing required vars,
 * so anything imported from it would require a full `.env`.
 */
export function validateEnvBounds(
  value: {
    SHUTDOWN_GRACE_PERIOD_MS: number;
    SHUTDOWN_STEP_TIMEOUT_MS: number;
    SHUTDOWN_WORKERS_TIMEOUT_MS: number;
    SHUTDOWN_DEADLINE_MS: number;
    OUTBOX_LEASE_SECONDS: number;
    OUTBOX_HANDLER_BUDGET_SECONDS: number;
    EMAIL_LEASE_SECONDS: number;
    EMAIL_DEAD_RETRY_HOURS: number;
    EMAIL_DEAD_REPLAY_WINDOW_HOURS: number;
  },
  ctx: z.RefinementCtx,
): void {
  const shutdownBudgetMs = worstCaseShutdownMs({
    graceMs: value.SHUTDOWN_GRACE_PERIOD_MS,
    stepMs: value.SHUTDOWN_STEP_TIMEOUT_MS,
    workersMs: value.SHUTDOWN_WORKERS_TIMEOUT_MS,
  });
  if (shutdownBudgetMs > value.SHUTDOWN_DEADLINE_MS) {
    ctx.addIssue({
      code: "custom",
      path: ["SHUTDOWN_DEADLINE_MS"],
      message: `SHUTDOWN_DEADLINE_MS (${value.SHUTDOWN_DEADLINE_MS}) must cover the worst-case shutdown (${shutdownBudgetMs}ms): SHUTDOWN_GRACE_PERIOD_MS + ${GRACE_MARGIN_MS}, 2 x SHUTDOWN_STEP_TIMEOUT_MS (http, database pool), SHUTDOWN_WORKERS_TIMEOUT_MS, the ${TELEMETRY_FLUSH_TIMEOUT_MS + TELEMETRY_FLUSH_MARGIN_MS}ms telemetry flush and the ${DEADLINE_FLUSH_TIMEOUT_MS}ms deadline flush, or a slow but healthy shutdown is cut by the deadline and exits 1.`,
    });
  }

  const leaseFloor = value.OUTBOX_HANDLER_BUDGET_SECONDS + OUTBOX_SETTLE_MARGIN_SECONDS;
  if (value.OUTBOX_LEASE_SECONDS < leaseFloor) {
    ctx.addIssue({
      code: "custom",
      path: ["OUTBOX_LEASE_SECONDS"],
      message: `OUTBOX_LEASE_SECONDS (${value.OUTBOX_LEASE_SECONDS}) must be at least OUTBOX_HANDLER_BUDGET_SECONDS (${value.OUTBOX_HANDLER_BUDGET_SECONDS}) + the ${OUTBOX_SETTLE_MARGIN_SECONDS}s claim and settle margin (${leaseFloor}), or a handler still within its budget outlives the lease and another relay claims the same event.`,
    });
  }

  const emailLeaseFloor = EMAIL_SEND_TIMEOUT_SECONDS + EMAIL_SETTLE_MARGIN_SECONDS;
  if (value.EMAIL_LEASE_SECONDS < emailLeaseFloor) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_LEASE_SECONDS"],
      message: `EMAIL_LEASE_SECONDS (${value.EMAIL_LEASE_SECONDS}) must be at least the ${EMAIL_SEND_TIMEOUT_SECONDS}s send timeout + the ${EMAIL_SETTLE_MARGIN_SECONDS}s claim and settle margin (${emailLeaseFloor}), or a batch still waiting on the provider outlives the lease and another worker sends the same emails again.`,
    });
  }

  if (value.EMAIL_DEAD_REPLAY_WINDOW_HOURS <= value.EMAIL_DEAD_RETRY_HOURS) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_DEAD_REPLAY_WINDOW_HOURS"],
      message: `EMAIL_DEAD_REPLAY_WINDOW_HOURS (${value.EMAIL_DEAD_REPLAY_WINDOW_HOURS}) must exceed EMAIL_DEAD_RETRY_HOURS (${value.EMAIL_DEAD_RETRY_HOURS}), or a dead email leaves its replay window before its first replay is due and is never retried.`,
    });
  }

  if (value.EMAIL_DEAD_REPLAY_WINDOW_HOURS > EMAIL_IDEMPOTENCY_KEY_TTL_HOURS) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_DEAD_REPLAY_WINDOW_HOURS"],
      message: `EMAIL_DEAD_REPLAY_WINDOW_HOURS (${value.EMAIL_DEAD_REPLAY_WINDOW_HOURS}) must be at most ${EMAIL_IDEMPOTENCY_KEY_TTL_HOURS}: the provider keeps an idempotency key for ${EMAIL_IDEMPOTENCY_KEY_TTL_HOURS} hours, so a later replay of a batch it already accepted would send every email twice.`,
    });
  }
}

function isTrustedProxyEntry(entry: string): boolean {
  if (entry === "private" || isIP(entry) !== 0) return true;

  const [address = "", prefix = "", ...rest] = entry.split("/");
  if (rest.length > 0 || !/^\d{1,3}$/.test(prefix)) return false;

  const family = isIP(address);
  if (family === 4) return Number(prefix) <= 32;

  return family === 6 && Number(prefix) <= 128;
}

export function validateTrustedProxiesEnv(
  value: { TRUSTED_PROXIES?: string[] },
  ctx: z.RefinementCtx,
): void {
  const badProxies = value.TRUSTED_PROXIES?.filter((entry) => !isTrustedProxyEntry(entry)) ?? [];
  if (badProxies.length === 0) return;

  ctx.addIssue({
    code: "custom",
    path: ["TRUSTED_PROXIES"],
    message: `TRUSTED_PROXIES has entries that are not \`private\`, an IP or a CIDR: ${badProxies.join(", ")}. They would silently trust nothing.`,
  });
}

const COOKIE_DOMAIN_SHAPE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function coversHost(domain: string, host: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function siteOf(host: string): string {
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

/**
 * A cookie domain that is not a parent of every host fails quietly in a browser: it is
 * dropped, which signs everyone out with no error anywhere. Refusing the boot is the
 * only signal that gets read.
 */
function validateCookieDomain(
  value: {
    APP_ORIGIN: string;
    BETTER_AUTH_URL: string;
    COOKIE_DOMAIN?: string;
  },
  ctx: z.RefinementCtx,
): void {
  const cookieDomain = value.COOKIE_DOMAIN;
  if (!cookieDomain) return;

  if (!COOKIE_DOMAIN_SHAPE.test(cookieDomain)) {
    ctx.addIssue({
      code: "custom",
      path: ["COOKIE_DOMAIN"],
      message: `COOKIE_DOMAIN (${cookieDomain}) must be a bare lowercase parent domain, e.g. example.com.`,
    });
    return;
  }

  if (getPublicSuffix(cookieDomain, { allowPrivateDomains: true }) === cookieDomain) {
    ctx.addIssue({
      code: "custom",
      path: ["COOKIE_DOMAIN"],
      message: `COOKIE_DOMAIN (${cookieDomain}) is a public suffix: browsers reject the cookie, which signs everyone out. Use a domain you own, or leave it empty.`,
    });
    return;
  }

  const hosts = [value.APP_ORIGIN, value.BETTER_AUTH_URL].map(hostOf);
  const outside = hosts.filter((host) => !coversHost(cookieDomain, host));
  if (outside.length === 0) return;

  ctx.addIssue({
    code: "custom",
    path: ["COOKIE_DOMAIN"],
    message: `COOKIE_DOMAIN (${cookieDomain}) is not a parent of ${outside.join(", ")}: the browser would drop the session cookie and sign everyone out.`,
  });
}

/**
 * The auth cookies are SameSite=Lax: an app and an api on two sites (two registrable
 * domains, or two names under a public suffix such as up.railway.app) never see them on
 * the app's fetches, so every sign-in silently fails. Localhost ports share one site.
 */
function validateSameSite(
  value: { APP_ORIGIN: string; BETTER_AUTH_URL: string },
  ctx: z.RefinementCtx,
): void {
  const appSite = siteOf(hostOf(value.APP_ORIGIN));
  const apiSite = siteOf(hostOf(value.BETTER_AUTH_URL));
  if (appSite === apiSite) return;

  ctx.addIssue({
    code: "custom",
    path: ["BETTER_AUTH_URL"],
    message: `BETTER_AUTH_URL (${apiSite}) and APP_ORIGIN (${appSite}) are not on the same site: the browser would drop the SameSite=Lax auth cookies and sign everyone out. Serve the api and the app under one domain you own (e.g. api.example.com and app.example.com).`,
  });
}

export function validateHostsEnv(
  value: {
    APP_ORIGIN: string;
    BETTER_AUTH_URL: string;
    COOKIE_DOMAIN?: string;
  },
  ctx: z.RefinementCtx,
): void {
  validateCookieDomain(value, ctx);
  validateSameSite(value, ctx);
}

export function frontOrigins(value: { CORS_ORIGIN?: string[] }): string[] {
  return value.CORS_ORIGIN ?? ["http://localhost:5173"];
}
