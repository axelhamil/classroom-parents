# Deployment

Hand-over checklist for the owner of the hosting accounts. Everything else (install, build, function, region, cron, headers, CSP) is versioned: `apps/api/vercel.json`, `apps/app/vercel.ts`, `apps/site/vercel.json`, `apps/clock/wrangler.jsonc`. Nothing in this repo deploys by itself and no file names an account, team, project id or domain. Follow the steps in order.

## 1. Accounts and the repository

Vercel (Hobby), Neon (Free), Cloudflare (Free, Workers only), Google Cloud, Resend, Anthropic, a domain you control (`<domain>` below), and a GitHub account.

Vercel creates a project only from a repository its owner owns: a collaborator on someone else's personal repository cannot import it. Before step 3, the repository must live on your GitHub account:

- **Transfer** (GitHub, Settings, Transfer ownership): one repository, the author keeps contributing as a collaborator. Preferred.
- **Fork** on your account, kept in sync with "Sync fork": production then deploys only what you synced.

Either way, recreate the release bot on your account: a GitHub App with contents and pull requests write access, installed on the repository, its client id in the variable `BOT_CLIENT_ID` and its private key in the secret `BOT_PRIVATE_KEY` (Settings, Secrets and variables, Actions). Without them release-please never opens a release PR, `main` never moves, and production never deploys.

## 2. Database (Neon)

One project in **AWS Europe (Frankfurt), `aws-eu-central-1`**, Postgres 18 (the migrations use the native `uuidv7()`). Copy two connection strings:

- `DATABASE_URL`: the **pooled** string (host contains `-pooler`), for every request.
- `DATABASE_URL_DIRECT`: the **direct** string, for the migrations and for the stream hub's `LISTEN`, which a transaction pooler cannot hold.

Neither is ever given to a preview. Why Neon and not a free Postgres without a compute cap: it is the free EU option documented on Postgres 18; see step 13 for what its 100 CU-hours allow.

## 3. Vercel: three projects

Import your repository three times (Add New, Project). The configure screen comes before the first deployment, and the first deployment of a project is always a production one, built with the Production variables, so fill everything in on that screen:

| Project | Root Directory | Framework preset |
|---|---|---|
| `api` | `apps/api` | Other (the config sets `framework: null`, Bun runtime, 300 s, `fra1`) |
| `app` | `apps/app` | Vite |
| `site` | `apps/site` | Astro |

For each: Node.js 26.x, "Include files outside the Root Directory" on (the build reads `packages/*` and the root lockfile), `ENABLE_EXPERIMENTAL_COREPACK=1` (it installs the `packageManager` pnpm instead of the one Vercel infers).

**api: leave `DATABASE_URL_DIRECT` out of the import.** The first build then stops before migrating, whatever branch it took. Once the project exists: Settings, Environments, Production, Branch Tracking = `main`; then add `DATABASE_URL_DIRECT` and redeploy `main`. A production build checks the whole api environment before migrating, and fails naming every missing variable, so a half-configured deployment never replaces a healthy one.

**api** variables, scope Production only (the api never builds a preview):

| Name | Example | Required | Source |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://…-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require` | yes | Neon, pooled |
| `DATABASE_URL_DIRECT` | `postgresql://…eu-central-1.aws.neon.tech/neondb?sslmode=require` | yes, after Branch Tracking | Neon, direct |
| `BETTER_AUTH_URL` | `https://api.<domain>` | yes | your domain |
| `BETTER_AUTH_SECRET` | 44 random characters | yes | `openssl rand -base64 32` |
| `APP_ORIGIN` | `https://app.<domain>` | yes | your domain |
| `CORS_ORIGIN` | `https://app.<domain>` | yes | your domain |
| `COOKIE_DOMAIN` | `<domain>` | yes | your domain |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | | yes | step 5 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `mailto:contact@<domain>` | yes | step 6 |
| `RESEND_API_KEY`, `RESEND_FROM` | `KeepUpKids <alertes@<domain>>` | yes | step 7 |
| `ANTHROPIC_API_KEY` | | yes | step 8 |
| `CRON_SECRET` | 64 hex characters | yes | step 9 |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | `production` | no | Sentry |
| `BETTER_AUTH_SECRETS` | | no | only to rotate `BETTER_AUTH_SECRET` (linked Google tokens are sealed with it) |

Set by the function itself, leave unset: `NODE_ENV` (production on a production deployment; setting it would make the install skip the build tools), `RATE_LIMIT_STORE` (forced to `postgres`), `STREAM_MAX_LIFETIME_MS` (240 s, refused above 270 s), `DATABASE_POOL_MAX` (5), `RATE_LIMIT_POOL_MAX` (2), `DATABASE_POOL_IDLE_TIMEOUT_MS` (1 s: an idle connection keeps the instance billed). `TRUSTED_PROXIES` is not read: the client address comes from the platform, never from a header.

**app** and **site**, Production and Preview, read at build time; a missing required URL fails the build with its name. Then set their Branch Tracking to `main` too.

| Project | Name | Example | Required | Source |
|---|---|---|---|---|
| app | `VITE_API_URL` | `https://api.<domain>` | yes | also the CSP `connect-src` |
| app | `VITE_SITE_URL` | `https://<domain>` | yes | your domain |
| app | `VITE_CONTACT_EMAIL` | `contact@<domain>` | yes | your mailbox |
| app | `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT` | `production` | no | Sentry |
| app | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | | no | source maps, all three or none |
| site | `PUBLIC_SITE_URL` | `https://<domain>` | yes | no trailing slash |
| site | `PUBLIC_APP_URL` | `https://app.<domain>` | yes | no trailing slash |

**Production and previews.** Only `main` deploys production. The api builds nothing else (`git.deploymentEnabled`) and migrates only when `VERCEL_ENV=production`, so no preview reaches the database or the migrations. App and site previews are static builds of the branch with their Preview variables: useful to review the UI and the landing, unable to sign in (see step 4).

**Migrations.** On production the build checks the environment, then runs the committed migrations against `DATABASE_URL_DIRECT`, then Vercel promotes the deployment. A failed migration fails the build: production keeps the previous deployment and the schema is left as it was (the pending migrations apply in one transaction). Between the migration and the promotion, the previous deployment serves on the new schema, and after a rollback it does so for as long as it stays: every migration therefore expands and never contracts what deployed code still uses (rule 6 of `packages/drizzle/CLAUDE.md`). Fix a broken migration in a new commit; never edit one that already ran.

## 4. Custom domains

`<domain>` (and `www` redirecting to it) on `site`, `app.<domain>` on `app`, `api.<domain>` on `api`. Mandatory: the session cookie is SameSite=Lax and shared through `COOKIE_DOMAIN`, and `vercel.app` is a public suffix, so two `*.vercel.app` hosts are two sites. The api refuses to boot on them, and a `*.vercel.app` preview can never sign in.

## 5. Google OAuth (production client)

1. Google Cloud project dedicated to production, OAuth consent screen External, app name KeepUpKids, support email, logo, homepage `https://app.<domain>`, privacy policy `https://app.<domain>/privacy`, authorised domain `<domain>` verified in Search Console.
2. OAuth client of type Web: authorised redirect URIs `https://api.<domain>/api/auth/callback/google` (parent sign-in) and `https://api.<domain>/api/auth/callback/google-classroom` (child link).
3. Enable the Google Classroom API.
4. Scopes to declare and have verified (single source `apps/api/src/shared/auth/google-scopes.ts`): `openid`, `email`, `profile`, `https://www.googleapis.com/auth/classroom.courses.readonly`, `https://www.googleapis.com/auth/classroom.announcements.readonly`, `https://www.googleapis.com/auth/classroom.coursework.me.readonly`. The three Classroom scopes are sensitive: verification needs a justification per scope and a demo video, then 2 to 8 weeks.

## 6. VAPID

`bunx web-push generate-vapid-keys`, once: a new pair invalidates every push subscription.

## 7. Resend

Verified sending domain (SPF, DKIM, DMARC), EU region, live key in `RESEND_API_KEY`, `RESEND_FROM` on that domain.

## 8. Anthropic

Production key in `ANTHROPIC_API_KEY`; ask for zero data retention before real minors' data.

## 9. CRON_SECRET

`openssl rand -hex 32`. The same value goes in the api project and in the Worker: Vercel's daily cron sends it to `/internal/sweep`, the Worker sends it to `/internal/tick`. Unset, both routes answer 404 and no sync, reminder or sweep runs.

## 10. Clock Worker (Cloudflare)

Vercel Hobby allows one cron a day. `apps/clock` is a Worker whose cron (`*/15 * * * *`) posts to `/internal/tick` with the bearer, times out after 50 s and fails the invocation on any non-2xx. It sends no personal data. Every 15 minutes, not every minute, so the database can sleep (step 13): a reminder set on a quarter hour leaves on time, any other one up to 14 minutes late.

```sh
pnpm --filter clock exec wrangler login
pnpm --filter clock exec wrangler secret put API_URL       # https://api.<domain>
pnpm --filter clock exec wrangler secret put CRON_SECRET   # the value of step 9
pnpm --filter clock run deploy
```

The deploy refuses to proceed while a required secret is missing. Logs: Cloudflare dashboard, Workers, `clock`, Observability.

## 11. First deploy verification

```sh
curl -s https://api.<domain>/livez                      # 200
curl -s https://api.<domain>/readyz                     # 200, database pass
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://api.<domain>/internal/tick -H 'Authorization: Bearer wrong'   # 401
curl -s -X POST https://api.<domain>/internal/tick -H "Authorization: Bearer $CRON_SECRET"   # 200, one outcome per job
curl -sI https://app.<domain>/sw.js                     # Cache-Control: no-cache and the CSP
curl -sI https://app.<domain>/assets/missing.js         # 404
```

Then sign in on `https://app.<domain>`, and check that the Worker's invocations are green and that `outbox_event` has no row left with `dispatched_at` null.

## 12. Rollback

Vercel, project, Deployments, previous production deployment, Instant Rollback (app, site or api). The schema is not rolled back: the expand/contract rule (step 3, Migrations) keeps the previous api running on it. A Worker: `wrangler rollback`.

## 13. Free-tier budget

A month is 730 h. Measured on the built function: an instance stays up 1.13 s after a tick (30.1 s before the pool idle timeout was lowered to 1 s). A live stream holds an instance and a database connection for up to 240 s, then reconnects; a hidden tab closes it.

| Budget | Included | Clock (2,920 ticks, 30 sweeps) | Left for parents |
|---|---|---|---|
| Neon compute | 100 CU-h | awake 5 min after each tick: 1/3 × 730 h × 0.25 CU = 61 CU-h | 39 CU-h, about 5 h a day with the app open somewhere |
| Vercel Provisioned Memory (2 GB) | 360 GB-h | 2,920 × 1.13 s + 30 × 91 s = 1.7 h × 2 GB = 3.4 GB-h | 356 GB-h, about 5.9 h a day of open streams if each holds its own instance |
| Vercel Active CPU | 4 h | under 0.1 h | most of it |
| Vercel invocations | 1,000,000 | 2,950 | 15 reconnects per open hour, far below |
| Cloudflare Workers | 5 crons, 100,000 requests a day, 10 ms CPU | 1 cron, 96 runs a day, waiting on fetch costs no CPU | n/a |

Plainly: this hosts a handful of families, not a school. The binding limit is Neon's 100 CU-h (about 5 hours a day of app open outside the tick windows); when it runs out the database is suspended until the next month, and when Vercel's runs out the whole Hobby team (api, app, site) answers 503 until you act. `STREAM_MAX_LIFETIME_MS` does not save anything, reconnecting holds the same time; what does is fewer open tabs, which the app already ensures by closing the stream of a hidden tab. Beyond that: Neon Launch, Vercel Pro.

Other limits:

- Vercel Hobby is for non-commercial use only: a paid KeepUpKids needs Pro.
- One cron a day on Hobby, fired within its hour: the sweep is daily, the tick lives on Cloudflare.
- Neon sleeps after 5 min idle: the first request after that waits for a cold start.
- Google Testing mode until verification: 100 test users at most and refresh tokens that expire after 7 days (children then fall to `needs_reconnect`).

## Test Classroom (demo domain)

Exercises the real Google path end to end on synthetic data only. Google's route for developers is a Google Workspace for Education demo domain (`gedu.demo.<your domain>`, see developers.google.com/workspace/classroom/support/access): managed teachers and pupils, full Classroom API. A personal Gmail account cannot create an active course through the API, so it is not used.

The class is versioned in `scripts/test-classroom-template.ts`: a French 4e B, six courses (Maths, Français, Histoire-Géo, SVT, Anglais, EPS), one teacher account per course, two pupils (twins, for the multi-child path), six weeks of announcements and coursework dated from an anchor Monday. Every name is invented; the texts reuse the extraction eval set (`modules/extraction/eval/classroom-dataset.ts`) where its relative wording fits.

Manual steps (yours, never an agent's):

1. Sign up for the demo domain on a sub-domain you own, as Google's page describes (primary domain, live base domain). In the Admin console create the accounts the dry run lists: `prof.maths`, `prof.francais`, `prof.histoire`, `prof.svt`, `prof.anglais`, `prof.eps`, `eleve.jade`, `eleve.noe` at that domain; put the six teachers in the group allowed to create classes (Classroom settings, verified teachers).
2. A separate Google Cloud project, Classroom API enabled. Create a service account with a JSON key, store the key **outside the repo** (the script refuses a key inside it), and note its client ID.
3. Admin console, Security, Access and data control, API controls, Manage Domain Wide Delegation: add that client ID with these scopes (propagation can take up to 24 h):
   - `https://www.googleapis.com/auth/classroom.courses`
   - `https://www.googleapis.com/auth/classroom.rosters`
   - `https://www.googleapis.com/auth/classroom.announcements`
   - `https://www.googleapis.com/auth/classroom.coursework.students`
4. Provision, from a variables file outside the repo (never a tracked `.env`):

   ```sh
   export TEST_CLASSROOM_DOMAIN=gedu.demo.<your domain>
   export TEST_CLASSROOM_ALLOWED_DOMAINS=gedu.demo.<your domain>   # anything else is refused
   export TEST_CLASSROOM_ANCHOR=2026-11-16                         # a Monday, keep it for every rerun
   export TEST_CLASSROOM_SERVICE_ACCOUNT_FILE=~/secrets/test-classroom-sa.json
   bun scripts/provision-test-classroom.ts --dry-run   # prints the plan, calls nothing, needs no key
   bun scripts/provision-test-classroom.ts             # courses, invitations accepted, posts
   ```

   The script impersonates each teacher (and each pupil to accept the invitation) through the delegation. It refuses a course whose name lacks `[TEST]`, and is idempotent: a course is found by name, a post by its text, a coursework by its title, so a rerun writes nothing. Each course carries the marker `classroom-parents test template v<n>, anchor <date>` in its description; a rerun with another anchor is refused instead of republishing shifted dates. Posts dated after now are created as drafts scheduled at their Paris time, so the class fills up day by day like a real one; posts already past are published at once and Classroom dates them now, so pick the anchor of the current week.
5. Life steps, one at a time, to test sync, field freeze, withdrawal and reminders (`--dry-run --step <n>` shows the step first; each step is idempotent):
   - `--step 1`: correction announcement moving the maths test, and the DM n°4 due date moved;
   - `--step 2`: the museum trip cancelled;
   - `--step 3`: the reading questionnaire withdrawn (deleted);
   - `--step 4`: the orienteering announcement edited in place with a new date.

   Only the Cloud project that created a coursework or an announcement may patch or delete it: run every step with the same service account as the provisioning.
6. Point the local api at an OAuth Web client of that same Cloud project (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), consent screen Internal to the demo domain or External in Testing with your own account as test user. Authorised redirect URIs are those of the api origin (`BETTER_AUTH_URL`, `http://localhost:3000` by default): `http://localhost:3000/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google-classroom`. Sign in as yourself, link `eleve.jade` then `eleve.noe` as children: the published posts appear after the first sync.

A coursework given without a due time in the template is due at 23:59 Paris, as the Classroom UI does: the API takes a due date only with a due time.
