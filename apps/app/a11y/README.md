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
- **Page width**: a page in `FULL_WIDTH_PAGES` leaves at most 25 % of a
  1440 px screen empty (`page-width.spec.ts`).
- **Reduced motion**: `prefers-reduced-motion: reduce` skips the theme view
  transition entirely (asserted through a `MutationObserver`, since the
  transition leaves no trace once it ends).

Lighthouse is deliberately absent: its a11y category runs a subset of axe, so a
budget of 100 would restate what the axe run already proves, for two more
minutes of CI and one more source of flake.

- **Content-Security-Policy**: the preview serves the production headers and
  CSP (`src/hosting/app-hosting.ts`, the object `vercel.ts` deploys), and any
  CSP violation logged in a page fails its test (`csp.ts`, the `test` every
  spec imports), the journey included.

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
  off this suite.** Every authenticated test signs in as the one seeded parent,
  so the bucket a full sweep fills is that parent's (`global:<userId>`); the
  **IP**-keyed one (`global:<ip>`) only takes `/api/auth/*` (the API nulls the
  user there, `sessionMiddleware`) and the public pages. Measured over a full
  sweep at 4 workers: 361 requests in the parent's bucket in about 30 s
  (337 when it broke the then-300/min ceiling), and 135 in the IP bucket. Worker count bounds
  neither: the whole sweep fits in one window, so its request count is what
  matters. What fixed it was tuning the API's burst window to what opening the
  app costs, the signed-in home fires 9 calls in that bucket
  (`GLOBAL_POLICY` in
  `apps/api/src/shared/middleware/rate-limit.policies.ts`, now 600/min burst
  with the 1800/hour sustained ceiling unchanged). The gate's API runs with
  `RATE_LIMIT_GLOBAL_PER_MINUTE=1200` (CI and locally), its own room for one
  parent signed in on four browsers; production keeps 600 and refuses a higher
  value at startup. A full sweep measured 790 requests in the parent's bucket
  over 2.4 min, none refused at 600, 20 November 2026. The hour window still holds:
  about five full sweeps per hour on one API process before it refuses the
  parent. The pin to `4` stays as a courtesy cap on host load. A spec that
  fakes the family (`serveFamily`) fakes everything the home it opens reads,
  `/home/*` included, and `pinShell` fakes `/assistant/preferences`, `/notifications/unread-count` and `/school-calendar`, read by the shell on every page: each request left to the live API spends the seeded
  parent's bucket (a full sweep measured 475 there, 19 November 2026). The
  limiter is stored in Postgres and the API also keeps blocked keys in memory:
  between two local sweeps inside the hour, empty `rate_limit` and restart the
  API, or the second sweep fails on 429s that look like broken pages.
- **Resetting the limiter takes two steps.** `DELETE FROM rate_limit` on the
  dev database *and* a restart of the API process, `inMemoryBlockOnConsumed`
  caches the block in-process, so clearing the table alone leaves it in place.

`A11Y_WIDTH=390` runs the whole audit at another screen width (specs that set
their own viewport keep it), which is how a layout change is checked on a
phone, a tablet and a large screen:

```sh
for width in 390 768 1280 1440 1920; do A11Y_WIDTH=$width pnpm --filter app check:a11y; done
```

## Dates

The home changes with the day: on a weekday morning the briefing covers today, from
the evening and over the weekend it covers the next school day and pulls in the
deadlines that fall before it. So the gate never runs on the day it happens to run:
every page's clock is pinned (`csp.ts`) to `TODAY` at 9:00, a school Thursday
(`SCHOOL_THURSDAY`, `events-fixtures.ts`), in the `Europe/Paris` zone. A spec that needs
another hour pins it with `todayAt(...)` and dates its fixtures with `inDays(...)`, never
from `new Date()`. The `weekend` project pins a Saturday and checks that the briefing,
tonight and the late block agree on Monday (`weekend.spec.ts`); the icon badge counts the unread notifications (`notifications.spec.ts`).
`A11Y_TODAY` moves the audit to another day, which is how a change is checked across a
week, a month or a year boundary:

```sh
for day in 2026-11-16 2026-11-17 2026-11-18 2026-11-19 2026-11-20 2026-11-30 2026-12-31; do
  A11Y_TODAY=$day pnpm --filter app check:a11y
done
```

Restart the API and clear the limiter between runs (see above).

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
