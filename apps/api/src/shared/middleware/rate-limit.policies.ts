import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { WindowConfig } from "../ports/rate-limiter.port";
import { resolveClientIp } from "./rate-limit.ip";

export interface PolicyConfig {
  name: string;
  keyFn: (c: Context) => string;
  windows: WindowConfig[];
  emitSecurityEvent?: boolean;
  advertiseBudget?: boolean;
  // Deny (503) instead of allowing through when the limiter store itself errors.
  // Set on auth/abuse-sensitive policies: a store outage must not silently disable
  // brute-force protection (OWASP A10:2025 / CWE-636). GLOBAL/CSP stay fail-open.
  failClosed?: boolean;
  captchaAboveRatio?: number;
}

const CAPTCHA_ABOVE_RATIO = 0.8;

function ipKeyFn(name: string): (c: Context) => string {
  return (c) => `${name}:${resolveClientIp(c)}`;
}

// Two windows with two different jobs: the minute window bounds a BURST, the hour
// window is the sustained anti-abuse ceiling (1800 = 30/min, unchanged). The burst window
// is tuned against what opening the app costs, measured: the signed-in home fires 9 calls
// in this bucket (the calendar period and its two neighbours, the week's progress, the
// review, overdue and next-deadline lists, the stream, the sync on open), the settings
// page 6. Four browsers of one parent opening the app back to back (the accessibility
// gate) spend 337 in under a minute, so 300 refused that parent mid-burst. 600 leaves
// that burst near half its room, and at a third of the hour window a runaway client is
// still stopped within three minutes. Every credential path carries its own far tighter,
// fail-closed policy below.
//
// `sessionMiddleware` deliberately nulls the user for `/api/auth/*`, so BetterAuth
// traffic, including a signed-in user's session query, keys on
// the IP, not the user. Two signed-in users behind one NAT therefore share this
// bucket for that traffic.
export const GLOBAL_POLICY: PolicyConfig = {
  name: "global",
  keyFn: (c) => {
    const user = c.get("user") as { id: string } | null | undefined;
    return `global:${user?.id ?? resolveClientIp(c)}`;
  },
  windows: [
    { policyName: "global", windowSec: 60, maxRequests: 600 },
    { policyName: "global", windowSec: 3600, maxRequests: 1800 },
  ],
};

export const AUTH_SIGN_IN_POLICY: PolicyConfig = {
  name: "auth-sign-in",
  keyFn: ipKeyFn("auth-sign-in"),
  windows: [{ policyName: "auth-sign-in", windowSec: 900, maxRequests: 5 }],
  emitSecurityEvent: true,
  failClosed: true,
  captchaAboveRatio: CAPTCHA_ABOVE_RATIO,
};

// /send-verification-email: public POST taking an arbitrary email, no session, the
// "make the server email a stranger" primitive, so it gets a tight ceiling. Without its own policy the global
// burst window is its only bound, which is not a bound on abuse: that window exists to
// let one legitimate user navigate quickly, not to cap how many strangers one IP can
// have mailed.
export const AUTH_SEND_VERIFICATION_POLICY: PolicyConfig = {
  name: "auth-send-verification",
  keyFn: ipKeyFn("auth-send-verification"),
  windows: [{ policyName: "auth-send-verification", windowSec: 900, maxRequests: 3 }],
  emitSecurityEvent: true,
  failClosed: true,
};

export const AUTH_SIGN_UP_POLICY: PolicyConfig = {
  name: "auth-sign-up",
  keyFn: ipKeyFn("auth-sign-up"),
  windows: [{ policyName: "auth-sign-up", windowSec: 3600, maxRequests: 10 }],
  emitSecurityEvent: true,
  failClosed: true,
  captchaAboveRatio: CAPTCHA_ABOVE_RATIO,
};

export const ACCOUNT_DELETE_POLICY: PolicyConfig = {
  name: "account-delete",
  keyFn: (c) => `account-delete:${c.get("user")?.id}`,
  windows: [{ policyName: "account-delete", windowSec: 900, maxRequests: 5 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// /verify-email: GET with ?token= (token consumption path).
export const AUTH_VERIFY_EMAIL_POLICY: PolicyConfig = {
  name: "auth-verify-email",
  keyFn: (c) => {
    const token = c.req.query("token");
    return `auth-verify-email:${token ?? resolveClientIp(c)}`;
  },
  windows: [{ policyName: "auth-verify-email", windowSec: 900, maxRequests: 5 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// GET /calendar/<secret>.ics: public, no session, polled by calendar clients from shared
// server pools, so it keys on the feed and not on the IP. A client asks about once per hour;
// 60 per hour leaves room for retries while bounding a leaked link hammered from many
// addresses. The key is a digest of the secret, so the limiter store never holds a usable link.
export const CALENDAR_FEED_POLICY: PolicyConfig = {
  name: "calendar-feed",
  keyFn: (c) => {
    const digest = createHash("sha256")
      .update(c.req.param("file") ?? resolveClientIp(c))
      .digest("hex")
      .slice(0, 32);
    return `calendar-feed:${digest}`;
  },
  windows: [{ policyName: "calendar-feed", windowSec: 3600, maxRequests: 60 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};

// The feed route is exempt from GLOBAL_POLICY: one calendar server polls the links of
// many parents from one address. Only unknown links spend this per-IP budget, so link
// guessing stays bounded while a shared poller serving real links never is. 300 leaves
// room for a poller still asking for links its parents revoked.
export const CALENDAR_FEED_MISS_POLICY: PolicyConfig = {
  name: "calendar-feed-miss",
  keyFn: ipKeyFn("calendar-feed-miss"),
  windows: [{ policyName: "calendar-feed-miss", windowSec: 3600, maxRequests: 300 }],
  emitSecurityEvent: true,
  failClosed: true,
  advertiseBudget: false,
};
