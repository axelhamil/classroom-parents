---
name: auth-server
description: Use when working on BetterAuth server-side, the request pipeline, session middleware, rate limiting, captcha, CSRF, cookies, or auth email URLs. Trigger on "BetterAuth", "auth.ts", "sessionMiddleware", "requireCsrf", "rate-limit", "captcha", "cookie", "sign-in", "session". Not for the front auth client.
---

# Auth (BetterAuth integration, server)

**Module-level singleton** (`src/auth.ts`), not wrapped in port/adapter, not in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*`). Every consumer imports `auth` directly. **No inline `db.*` in `auth.ts`**: a query it needs is a typed Drizzle function reading `resolveExecutor()` in a sibling file. Auth is infra, not domain: no repository, no port, no DI.

## Server pipeline (in order, `app.ts`)

health routes (before every middleware) → `requestId()` → request context (`resolveClientIp`, lazy) → `httpLogger` → `secureHeaders()` + `cors()` → `sessionMiddleware` (single `auth.api.getSession()`, stores user/session on ctx, skips `/api/auth/*`) → `requireRateLimit(GLOBAL_POLICY)` → `requireCsrf` on `CSRF_GUARDED_PATHS` (`/me`, `/me/*`) → per-endpoint fail-closed policies on `/api/auth/{sign-in,sign-up,send-verification,verify}-email` → `app.on(["GET","POST"], "/api/auth/*", auth.handler)` → business routes (`/me`) → `app.onError(errorHandler)`.

Protected handlers compose `requireAuth`. **Never re-call `auth.api.getSession()` per handler.**

## Security middleware (`shared/middleware/`)

- **Rate-limit** (`requireRateLimit`): policies in `rate-limit.policies.ts`. **Fail-closed on auth-sensitive policies** → 503 `RATE_LIMITER_UNAVAILABLE` on store error (store outage must not silently disable brute-force protection: OWASP A10:2025); GLOBAL stays fail-open. IP via `resolveClientIp` (OWASP rightmost-non-trusted; `TRUSTED_PROXIES` accepts `private`/CIDR/exact via `node:net` BlockList). BetterAuth `rateLimit` disabled, single envelope. Postgres store uses a **dedicated pool** (`getRateLimitDbClient()`, `storeFactoryFor(env.RATE_LIMIT_STORE, ...)`) isolated from the app pool, flood must not exhaust business query connections.
- **CSRF** (`requireCsrf`): validates `Origin` against CORS allowlist on unsafe methods (Origin-based, **not** double-submit, cross-origin deploy makes a readable double-submit cookie impossible). Bearer requests skip (no ambient cookie). Rejection: 403 `SECURITY_CSRF_FORBIDDEN` + `security.csrf.rejected` event (reason in audit only, never the response). Exempt: `/api/auth/*`. `env.CORS_ORIGIN` is the allowlist feeding `cors()` and `requireCsrf`; BetterAuth trusts `APP_ORIGIN` alone (`trustedOrigins`), so a CORS origin other than the app gets 403 `Invalid origin` on `/api/auth/*`.

- **Captcha** (off by default, env in `.env.example`): optional step of `requireRateLimit` on the sign-in and sign-up policies, a request above 80 % of the window needs a valid `X-Captcha-Token` or gets `CAPTCHA_REQUIRED`; a provider outage fails open.

## Defaults

`session.cookieCache: { enabled: true, maxAge: 60 }` (signature-only check between DB refreshes; keep `maxAge` ≤ 15 min for near-instant revoke, reduced to 60 s to make account bans effective within 1 min).

Cookies: `httpOnly`, `secure: isProd`, `sameSite: "lax"`. Lax requires the app and the api on the **same site** (same registrable domain): on two sites, or two sub-domains of a public suffix such as a platform domain, the browser drops the cookie on the app's fetches and everyone reads as signed out. `COOKIE_DOMAIN` (their common parent) shares the cookie across sub-domains; leave it empty only when both run on one host. CSRF stays covered by `requireCsrf` (Origin allowlist).

Two Google providers, one client. The parent signs in with `google` (identity scopes `openid email profile` only, no offline grant). A child's Google account is linked from the parent's session with `linkSocial({ provider: "google-classroom" })`: a `genericOAuth` provider (`shared/auth/child-accounts.ts`) carrying the Classroom scopes, `access_type=offline` and `prompt=select_account consent`, redirect URI `<api>/api/auth/callback/google-classroom`. **A child account never signs in**: BetterAuth finds a sign-in's owner by `(providerId, accountId)`, so a child linked under `google` would open the parent's session. `hooks.before` refuses `/sign-in/social` through `google-classroom` (403 `CHILD_ACCOUNT_SIGN_IN_FORBIDDEN`) and `session.create.before` refuses any session from its callback, proven by `check:child-sign-in`. `USER_ACCOUNT_LINKED` fires for `google-classroom` accounts only; no account keeps its `idToken`. Linked tokens are sealed by `account.encryptOAuthTokens` (key = the BetterAuth secret, rotation through `BETTER_AUTH_SECRETS`) and read back with `openToken` (`shared/auth/token-sealing.ts`), proven by `check:token-sealing`.

## Email URLs route through the app

`${env.APP_ORIGIN}/<route>?token=...` (opaque) or `${env.APP_ORIGIN}/<route>/<id>`. **Why**: branded UX; Outlook/Gmail mangle `?callbackURL=...` in API URLs. Don't pass `redirectTo`/`callbackURL` to auth-client methods when a `send*` server hook already builds the URL, silently overrides the canonical URL. Never pass `callbackURL` to `signIn.email`: its response then makes the client hard-navigate.

## Running code at every login

Use **`hooks.after` + `createAuthMiddleware` + `ctx.context.newSession`** (set on every login across flows, `null` on regular session checks). Do NOT use `databaseHooks.session.create` for code that needs the request: that hook has no access to `Request` headers (no cookies). A wiring on one specific path misses the other flows.
