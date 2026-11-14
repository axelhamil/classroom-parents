# classroom-parents

A French mobile-first PWA for parents. Link your children's Google Classroom accounts (read only), see the upcoming deadlines extracted from class announcements, and get a push alert before each one, even with the app closed.

Status: proof of concept, ready to hand over for a free-tier deployment (Vercel for the api, the app and the landing, Neon in Frankfurt, a Cloudflare Worker as the quarter-hour clock). Progress: [`ROADMAP.md`](ROADMAP.md).

## Stack

pnpm workspaces and Turborepo, Bun, Hono, BetterAuth, Drizzle on Postgres 18, React 19 with Vite and TanStack Router, shadcn. Built on a Clean Architecture + DDD monorepo boilerplate.

## Local setup

Versions are pinned in `mise.toml` (Node, pnpm, Bun).

```sh
pnpm install
docker compose up postgres -d
pnpm bootstrap
scripts/worktree-db.sh
pnpm db:migrate
pnpm dev
```

Postgres listens on `localhost:54329`. `pnpm bootstrap` copies each `.env.example` to `.env`; real keys never go in the repository. `scripts/worktree-db.sh` gives the current worktree its own database (`classroom_parents_<branch>`) and writes its `DATABASE_URL`.

## Checks

```sh
pnpm ci:check && pnpm check:boundaries
pnpm turbo run build type-check test
pnpm check:duplication && pnpm check:unused
```

## Deployment

Nothing deploys from this repo by itself. The account owner follows [`docs/DEPLOY.md`](docs/DEPLOY.md), one checklist from the accounts to the first-deploy verification.
