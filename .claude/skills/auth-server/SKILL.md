---
name: auth-server
description: Use when working on BetterAuth server-side, the request pipeline, session middleware, rate limiting, captcha, CSRF, cookies, or auth email URLs. Trigger on "BetterAuth", "auth.ts", "sessionMiddleware", "requireCsrf", "rate-limit", "captcha", "cookie", "sign-in", "session". Not for the front auth client.
---

# Auth (BetterAuth integration, server)

**Module-level singleton** (`src/auth.ts`), not wrapped in port/adapter, not in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*`). Every consumer imports `auth` directly. **No inline `db.*` in `auth.ts`**, SQL lives in `auth-queries.ts` as typed Drizzle functions reading `resolveExecutor()`. Auth is infra, not domain: no repository, no port, no DI.

## Server pipeline (in order, `app.ts`)

health routes (before every middleware) → `requestId()` → request context (`resolveClientIp`, lazy) → `httpLogger` → `secureHeaders()` + `cors()` → `sessionMiddleware` (single `auth.api.getSession()`, stores user/session on ctx, skips `/api/auth/*`) → `requireRateLimit(GLOBAL_POLICY)` → `requireCsrf` on `CSRF_GUARDED_PATHS` (`/me`, `/me/*`) → per-endpoint fail-closed policies on `/api/auth/{sign-in,sign-up,send-verification,verify}-email` → `app.on(["GET","POST"], "/api/auth/*", auth.handler)` → business routes (`/me`) → `app.onError(errorHandler)`.

Protected handlers compose `requireAuth`. **Never re-call `auth.api.getSession()` per handler.**

## Security middleware (`shared/middleware/`)

- **Rate-limit** (`requireRateLimit`): policies in `rate-limit.policies.ts`. **Fail-closed on auth-sensitive policies** → 503 `RATE_LIMITER_UNAVAILABLE` on store error (store outage must not silently disable brute-force protection: OWASP A10:2025); GLOBAL stays fail-open. IP via `resolveClientIp` (OWASP rightmost-non-trusted; `TRUSTED_PROXIES` accepts `private`/CIDR/exact via `node:net` BlockList). BetterAuth `rateLimit` disabled, single envelope. Postgres store uses a **dedicated pool** (`getRateLimitDbClient()`, `storeFactoryFor(env.RATE_LIMIT_STORE, ...)`) isolated from the app pool, flood must not exhaust business query connections.
- **CSRF** (`requireCsrf`): validates `Origin` against CORS allowlist on unsafe methods (Origin-based, **not** double-submit, cross-origin deploy makes a readable double-submit cookie impossible). Bearer requests skip (no ambient cookie). Rejection: 403 `SECURITY_CSRF_FORBIDDEN` + `security.csrf.rejected` event (reason in audit only, never the response). Exempt: `/api/auth/*`. `env.CORS_ORIGIN` is the single allowlist feeding `cors()`, `requireCsrf`, and BetterAuth.

- **Captcha** (off by default, env in `.env.example`): optional step of `requireRateLimit` on the sign-in and sign-up policies, a request above 80 % of the window needs a valid `X-Captcha-Token` or gets `CAPTCHA_REQUIRED`; a provider outage fails open.

## Defaults

`session.cookieCache: { enabled: true, maxAge: 60 }` (signature-only check between DB refreshes; keep `maxAge` ≤ 15 min for near-instant revoke, reduced to 60 s to make account bans effective within 1 min).

Cookies: `httpOnly`, `secure: isProd`, `sameSite: isProd ? "none" : "lax"`, `none` because SPA+API are distinct origins; CSRF covered by `requireCsrf` (Origin allowlist). Same-site deploy → switch to `"lax"`. `AUTH_COOKIE_DOMAIN` turns on cross-subdomain cookies.

## Email URLs route through the app

`${env.APP_URL}/<route>?token=...` (opaque) or `${env.APP_URL}/<route>/<id>`. **Why**: branded UX; Outlook/Gmail mangle `?callbackURL=...` in API URLs. Don't pass `redirectTo`/`callbackURL` to auth-client methods when a `send*` server hook already builds the URL, silently overrides the canonical URL. Never pass `callbackURL` to `signIn.email`: its response then makes the client hard-navigate.

## Running code at every login

Use **`hooks.after` + `createAuthMiddleware` + `ctx.context.newSession`** (set on every login across flows, `null` on regular session checks). Do NOT use `databaseHooks.session.create` for code that needs the request: that hook has no access to `Request` headers (no cookies). A wiring on one specific path misses the other flows.
