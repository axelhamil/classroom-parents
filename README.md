# classroom-parents

A French mobile-first PWA for parents. Link your children's Google Classroom accounts (read only), see the upcoming deadlines extracted from class announcements, and get a push alert before each one, even with the app closed.

Status: early development, see [`ROADMAP.md`](ROADMAP.md).

## Stack

pnpm workspaces and Turborepo, Bun, Hono, BetterAuth, Drizzle on Postgres 18, React 19 with Vite and TanStack Router, shadcn. Built on a Clean Architecture + DDD monorepo boilerplate.

## Local setup

Versions are pinned in `mise.toml` (Node, pnpm, Bun).

```sh
pnpm install
docker compose up postgres -d
pnpm bootstrap
pnpm db:push
pnpm dev
```

Postgres listens on `localhost:5433`. `pnpm bootstrap` copies each `.env.example` to `.env`; real keys never go in the repository.

## Checks

```sh
pnpm ci:check && pnpm check:boundaries
pnpm turbo run build type-check test
pnpm check:duplication && pnpm check:unused
```
