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
  with the 1800/hour sustained ceiling unchanged). The hour window still holds:
  about five full sweeps per hour on one API process before it refuses the
  parent. The pin to `4` stays as a courtesy cap on host load.
- **Resetting the limiter takes two steps.** `DELETE FROM rate_limit` on the
  dev database *and* a restart of the API process, `inMemoryBlockOnConsumed`
  caches the block in-process, so clearing the table alone leaves it in place.

## Dates

The home changes with the day: on a weekday morning the briefing covers today, from
the evening and over the weekend it covers the next school day and pulls in the
deadlines that fall before it, so the same deadline can sit in the briefing and in
the week. A spec that renders dated fixtures therefore pins the browser clock with
`todayAt(...)` and dates its fixtures with `inDays(...)` (`events-fixtures.ts`), both
read from one Paris day, `TODAY`, never from `new Date()`, and asserts what holds on
every day of the week. `A11Y_TODAY` overrides that day, which is how a change is
checked on every weekday and across a month or a year boundary:

```sh
for day in 2026-11-16 2026-11-17 2026-11-18 2026-11-19 2026-11-20 2026-11-21 2026-11-22 2026-11-30 2026-12-31; do
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
