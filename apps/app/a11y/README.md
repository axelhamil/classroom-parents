# Accessibility gate

`@axe-core/playwright` over the pages a regression would hurt most, plus the
interaction checks a rule engine cannot see. Runs on every PR
(`.github/workflows/ci.yml`), and locally with `pnpm --filter app check:a11y`.

## What blocks a merge

- **axe**: zero `serious` / `critical` WCAG 2.1 A/AA violations on every
  page in [`pages.ts`](./pages.ts), **in light and dark**. Dark is not
  decoration: `--primary` failed there while light passed.
- **Landmarks**: exactly one `<main>` and one `<h1>` per page. Already a
  CLAUDE.md rule; this is what makes it enforceable.
- **Keyboard**: the `/login` Google button is reachable from the keyboard; a dialog (account deletion, child disconnection)
  keeps focus inside on Tab and Shift+Tab and gives it back to its trigger on
  Escape.
- **Focus ring**: the destructive button's ring holds 3:1 against the dialog
  surface, measured on a screenshot in light and dark (a ring with an alpha
  suffix is exactly what arithmetic misjudges, see below).
- **Mobile shell**: the bottom navigation stays inside a 390, 768 and 1440 px
  viewport with no horizontal overflow, and every section is reachable from it
  with `aria-current="page"` on the active tab. `/login` (Google only) at 390 px keeps one
  `<main>`, one `<h1>` and no blocking violation (`shell.spec.ts`).
- **Reduced motion**: `prefers-reduced-motion: reduce` skips the theme view
  transition entirely (asserted through a `MutationObserver`, since the
  transition leaves no trace once it ends).

Lighthouse is deliberately absent: its a11y category runs a subset of axe, so a
budget of 100 would restate what the axe run already proves, for two more
minutes of CI and one more source of flake.

## Running it locally

The gate audits the **preview build** on port 4173, against a live API:

```sh
docker compose up postgres -d
pnpm db:migrate && pnpm --filter api db:seed # seeds dev@example.com and its session cookie
pnpm --filter api dev                        # API on :3000
pnpm --filter app check:a11y                 # builds nothing, run `pnpm --filter app build` first
```

Playwright starts the preview server itself and reuses one already listening.
`A11Y_BASE_URL` (default `http://localhost:4173`) moves it to another host and
port, and `VITE_API_URL` at build time points the build at another API, so a
worktree audits without taking a port another one holds:

```sh
pnpm --filter app build                       # with VITE_API_URL=http://<host>:<api port> in apps/app/.env
A11Y_BASE_URL=http://<host>:<port> pnpm --filter app check:a11y
```
Sign-in is Google only, so the setup does not sign in: `db:seed` creates a
session through BetterAuth and writes its signed cookie to `a11y/.auth/state.json`,
which the setup checks against `/` (the signed-in home) before the audit uses it.

Three things bite when running repeatedly:

- **A page audited after a gate redirect still looks green.** `audit()` asserts
  the final URL for that reason; if a session or policy gate fires, the failure
  names the redirect instead of silently auditing the wrong page.
- **`workers` is pinned to `4`, but that is not what keeps the rate limiter
  off this suite.** The bucket a full sweep fills is the **IP**-keyed one
  (`global:<ip>`), not the per-user one: the API nulls the user for
  `/api/auth/*` (`sessionMiddleware`), so a signed-in page's session
  queries are counted against the IP, next to every
  unauthenticated page load. Measured over a full sweep: 61 requests in
  `global:60:global:::1` against a then-60/min ceiling, one over, twice in a
  row, while the per-user bucket sat at 39. Worker count bounds neither: the
  ceiling is per minute across the whole run and the IP is identical from every
  worker. What fixed it was tuning the API's burst window to what a page view
  actually costs, a signed-in view fires up to 8 API calls, so 60/min allowed
  ~7 navigations per minute (`GLOBAL_POLICY` in
  `apps/api/src/shared/middleware/rate-limit.policies.ts`, now 300/min burst
  with the 1800/hour sustained ceiling unchanged). The pin to `4` stays as a
  courtesy cap on host load.
- **Resetting the limiter takes two steps.** `DELETE FROM rate_limit` on the
  dev database *and* a restart of the API process, `inMemoryBlockOnConsumed`
  caches the block in-process, so clearing the table alone leaves it in place.

## Adding a page

Append it to `PUBLIC_PAGES` or `AUTHENTICATED_PAGES` in [`pages.ts`](./pages.ts).
Nothing else, the spec iterates both lists across both colour schemes.

## Changing a colour token

Measure, do not compute. Tailwind mixes opacity in oklab, so a hand-rolled
oklch → sRGB blend misjudges anything with an alpha suffix: during this phase
the arithmetic condemned every destructive button in dark (fine in reality) and
cleared `--primary` (actually failing). Propose a value by calculation if it
helps, then let the gate rule on it.

## The journey

`journey.spec.ts` is the end-to-end proof, outside the audit: a parent signs in, links
two children, follows their deadlines (filter, detail, own alert, edit, deletion,
resync, history), sees a school block and reconnects, disconnects a child, then
deletes the account and the test checks that no row names them anymore. It runs against
`pnpm --filter api serve:journey`, the real api over FAKE_PROVIDERS with Google's
token endpoint stubbed and its periodic workers stopped: time moves only when the
journey asks the control server for a sync, alert or wipe tick at a chosen instant.

```sh
pnpm --filter app check:journey
```

Playwright starts that api and a preview build of its own (`dist/journey`, pointed at
it), so it needs only Postgres and this worktree's database, with no other client on
it: another api there relays the same outbox with real providers and turns a freshly
linked child into one to reconnect, so `serve:journey` refuses to start. The ports default to
4183 (app), 3183 (api) and 3189 (control) and move with `JOURNEY_APP_URL`,
`JOURNEY_API_URL` and `JOURNEY_CONTROL_PORT`.
