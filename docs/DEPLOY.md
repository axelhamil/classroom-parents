# Deployment

Two images, built from the repo root (the Dockerfiles prune the workspace themselves): `apps/api/Dockerfile` (Bun, runs the migrations then the server, workers in process) and `apps/app/Dockerfile` (static Vite build served by Caddy). CI builds both on every PR (`Build deploy images` job) and pushes nothing. Nothing in this repo deploys by itself.

## Local proof

```sh
docker build -f apps/api/Dockerfile -t classroom-api .
docker build -f apps/app/Dockerfile --build-arg VITE_API_URL=http://localhost:3000 -t classroom-app .
docker run --rm --network host --env-file <untracked file outside the repo> classroom-api
docker run --rm -p 8080:80 classroom-app && curl -sI localhost:8080/sw.js
```

The env file holds production-shaped dummy values; never commit it.

## Railway

One project, three services: Postgres (or Neon), `api`, `app`.

- **api**: source = this repo, root directory = repo root, config file path `apps/api/railway.json` (Dockerfile builder, readiness probe `/readyz`, restart on failure, 1 replica, 40 s drain covering `SHUTDOWN_DEADLINE_MS`). One replica only: the SSE stream hub is per instance in V1.
- **app**: source = this repo, root directory = repo root, builder Dockerfile, path `apps/app/Dockerfile`, healthcheck `/health`. Railway passes service variables as build arguments: set `VITE_API_URL` (and `VITE_CONTACT_EMAIL`) there. `API_ORIGIN` defaults to `VITE_API_URL` and feeds the CSP `connect-src`.
- **Domains**: both services on sub-domains of one domain you own (`app.<domain>`, `api.<domain>`). Two `*.up.railway.app` hosts are two sites: the boot refuses them because the SameSite=Lax session cookie would be dropped.

## Environment contract (api)

Validated by Zod at boot (`apps/api/src/shared/env-schema.ts`); a missing variable stops the boot and names itself.

| Always required | Required in production | Optional |
|---|---|---|
| `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `CORS_ORIGIN`, `COOKIE_DOMAIN`, `ANTHROPIC_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `RESEND_API_KEY`, `RESEND_FROM` | `BETTER_AUTH_SECRETS`, `SENTRY_DSN`, `TRUSTED_PROXIES` (set `private` on Railway), `FAKE_PROVIDERS` (refused in production) |

Linked Google tokens are sealed by BetterAuth with `BETTER_AUTH_SECRET`: rotating it needs `BETTER_AUTH_SECRETS`, never a plain replacement. Front build variables: `VITE_API_URL`, `VITE_CONTACT_EMAIL`, optional `VITE_SENTRY_*` (front Sentry then needs its ingest origin added to the CSP `connect-src` in `apps/app/Caddyfile`).

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

## Test Classroom (separate Cloud project)

Used to exercise the real Google path end to end without any real pupil.

1. Create two personal Gmail accounts: `prof` (teacher) and `eleve` (pupil). Personal accounts can create Classroom classes.
2. A separate Google Cloud project in Testing mode, Classroom API enabled, consent screen External with both accounts and your own as test users, an OAuth Web client. Add the redirect URIs of the environment under test (local: `http://localhost:3000/api/auth/callback/google` and `.../google-classroom`) and `https://developers.google.com/oauthplayground` for the publisher token.
3. As `prof`, create a class at classroom.google.com whose name starts with `[TEST]` (the script refuses any other course; another marker with `TEST_CLASSROOM_COURSE_PREFIX`) and invite `eleve`; accept the invitation as `eleve`.
4. Teacher token for the publisher: in the OAuth Playground, settings, "Use your own OAuth credentials" with the test client, scopes `https://www.googleapis.com/auth/classroom.announcements` and `https://www.googleapis.com/auth/classroom.courses.readonly`, sign in as `prof`, exchange the code, copy the refresh token. The project is in Testing mode, so this token expires after 7 days: past that the script fails with `invalid_grant`, redo this step.
5. Publish the synthetic set (the one the fakes and the extraction eval read, `modules/extraction/eval/synthetic.jsonl`; another file with `TEST_CLASSROOM_DATASET`). The script refuses to run without its variables, lists the teacher's courses when no course id is set, and never republishes an announcement whose text the course already shows:

   ```sh
   TEST_CLASSROOM_CLIENT_ID=... TEST_CLASSROOM_CLIENT_SECRET=... TEST_CLASSROOM_REFRESH_TOKEN=... \
     bun scripts/publish-test-classroom.ts            # prints the course ids
   TEST_CLASSROOM_COURSE_ID=... (same variables) bun scripts/publish-test-classroom.ts --dry-run
   TEST_CLASSROOM_COURSE_ID=... (same variables) bun scripts/publish-test-classroom.ts
   ```

   Pass the variables inline or from a file outside the repo, never a tracked `.env`.

   The `expected` events of the set hold only for the extraction eval: relative dates (« jeudi prochain », « pour demain ») are resolved from each line's `publishedAt`, while Classroom dates the published announcement at the moment of publication. In the test class, judge relative dates against the publication day, not against `expected`.
6. Point the api at the test client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), sign in as yourself, then link `eleve` as a child: the announcements appear as events after the first sync.

## Other providers

- **Resend**: verified sending domain (SPF, DKIM, DMARC), EU region, live key in `RESEND_API_KEY`, `RESEND_FROM` on that domain.
- **Anthropic**: production key; ask for zero data retention before real minors' data.
