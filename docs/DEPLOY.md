# Deployment

Three images, built from the repo root (the Dockerfiles prune the workspace themselves): `apps/api/Dockerfile` (Bun, runs the migrations then the server, workers in process), `apps/app/Dockerfile` (static Vite build served by Caddy) and `apps/site/Dockerfile` (static Astro landing served by Caddy). CI builds all three on every PR (`Build deploy images` job) and pushes nothing. Nothing in this repo deploys by itself.

## Local proof

```sh
docker build -f apps/api/Dockerfile -t classroom-api .
docker build -f apps/app/Dockerfile --build-arg VITE_API_URL=http://localhost:3000 --build-arg VITE_SITE_URL=http://localhost:8081 -t classroom-app .
docker build -f apps/site/Dockerfile --build-arg PUBLIC_SITE_URL=http://localhost:8081 --build-arg PUBLIC_APP_URL=http://localhost:8080 -t classroom-site .
docker run --rm --network host --env-file <untracked file outside the repo> classroom-api
docker run --rm -p 8080:80 classroom-app && curl -sI localhost:8080/sw.js
```

The env file holds production-shaped dummy values; never commit it.

## Railway

One project, four services: Postgres (or Neon), `api`, `app`, `site`.

- **api**: source = this repo, root directory = repo root, config file path `apps/api/railway.json` (Dockerfile builder, readiness probe `/readyz`, restart on failure, 1 replica, 40 s drain covering `SHUTDOWN_DEADLINE_MS`). One replica only: the SSE stream hub is per instance in V1.
- **app**: source = this repo, root directory = repo root, builder Dockerfile, path `apps/app/Dockerfile`, healthcheck `/health`. Railway passes service variables as build arguments: set `VITE_API_URL`, `VITE_SITE_URL` (and `VITE_CONTACT_EMAIL`) there. `API_ORIGIN` defaults to `VITE_API_URL` and feeds the CSP `connect-src`.
- **site**: same source, builder Dockerfile, path `apps/site/Dockerfile`, healthcheck `/health`, build arguments `PUBLIC_SITE_URL` (`https://<domain>`) and `PUBLIC_APP_URL` (`https://app.<domain>`), both origins without a trailing slash.
- **Domains**: the landing on the root domain, the app and the api on sub-domains of it (`app.<domain>`, `api.<domain>`). Two `*.up.railway.app` hosts are two sites: the boot refuses them because the SameSite=Lax session cookie would be dropped.

## Environment contract (api)

Validated by Zod at boot (`apps/api/src/shared/env-schema.ts`); a missing variable stops the boot and names itself.

| Always required | Required in production | Optional |
|---|---|---|
| `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `CORS_ORIGIN`, `COOKIE_DOMAIN`, `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `RESEND_FROM` | `BETTER_AUTH_SECRETS`, `SENTRY_DSN`, `TRUSTED_PROXIES` (set `private` on Railway), `FAKE_PROVIDERS` (refused in production) |

Linked Google tokens are sealed by BetterAuth with `BETTER_AUTH_SECRET`: rotating it needs `BETTER_AUTH_SECRETS`, never a plain replacement. Front build variables: `VITE_API_URL`, `VITE_SITE_URL`, `VITE_CONTACT_EMAIL`, optional `VITE_SENTRY_*` (front Sentry then needs its ingest origin added to the CSP `connect-src` in `apps/app/Caddyfile`).

Generate secrets on your machine, store them only in Railway: `openssl rand -base64 32` (`BETTER_AUTH_SECRET`), `bunx web-push generate-vapid-keys` (VAPID pair, generated once: changing it invalidates every push subscription).

## Google OAuth (production client)

1. Google Cloud project dedicated to production, OAuth consent screen External, app name, support email, logo, homepage `https://app.<domain>`, privacy policy `https://app.<domain>/privacy`, authorised domain `<domain>` verified in Search Console.
2. OAuth client of type Web: authorised redirect URIs `https://api.<domain>/api/auth/callback/google` (parent sign-in) and `https://api.<domain>/api/auth/callback/google-classroom` (child link).
3. Enable the Google Classroom API.
4. Scopes to declare and have verified (single source `apps/api/src/shared/auth/google-scopes.ts`):
   - `openid`, `email`, `profile` (parent sign-in, non sensitive);
   - `https://www.googleapis.com/auth/classroom.courses.readonly`;
   - `https://www.googleapis.com/auth/classroom.announcements.readonly`;
   - `https://www.googleapis.com/auth/classroom.coursework.me.readonly` (D13, the child's own coursework and due dates).
   The three Classroom scopes are sensitive: verification needs the justification of each, a demo video of the link flow and of where the data appears, then 2 to 8 weeks. Until then the app stays in Testing mode: 100 test users at most and refresh tokens that expire after 7 days (children then fall to `needs_reconnect`).

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

## Other providers

- **Resend**: verified sending domain (SPF, DKIM, DMARC), EU region, live key in `RESEND_API_KEY`, `RESEND_FROM` on that domain.
- **Anthropic**: production key; ask for zero data retention before real minors' data.
