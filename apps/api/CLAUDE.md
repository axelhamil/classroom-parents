# API rules

Hono on Bun, Clean Architecture + DDD, vertical-slice modules, inwire DI, BetterAuth, Drizzle. Auto-loaded under `apps/api/`. Cross-cutting rules: `/CLAUDE.md`. Package contracts it builds on: `packages/ddd-kit`, `packages/drizzle`, `packages/events`, `packages/outbox`, `packages/http` (each has its own `CLAUDE.md`).

**Subsystem detail lives in skills: invoke the one you need instead of guessing:**

| Skill | Covers |
|---|---|
| `auth-server` | BetterAuth singleton, request pipeline, rate-limit, CSRF, cookies, login hooks |
| `events-outbox` | transactional outbox, BetterAuth event bridge |
| `email-delivery` | email queue, delivery worker, Resend |
| `feature-slice` | implementing a story end to end once acceptance criteria exist |

## Layout

```
apps/api/src/
  shared/                       Cross-cutting infra (no business), see "Shared kernel" below
  modules/<context>/            One bounded context still hosted by the api (`health`, `rgpd`); new business modules go to `modules/` at the repo root
  container.ts                  Composition root: `.add()` cross-cutting + `.addModule()` per context + `.build()`
  composition/
    settings.ts                 `apiSettings(env)`: env mapped once onto each module's typed settings
    route-guards.ts             `routeGuards`: the `RouteGuards` of `@packages/http` built from `shared/middleware`
  auth.ts                       BetterAuth singleton, deliberate exception to the modules rule (config-as-code, the lib owns the model), mounted on `/api/auth/*`
  app.ts                        `Hono` construction, middleware, chained `.route()` mounts, `export const routes` / `export type AppType`. No server boot.
  index.ts                      Server entry: `Bun.serve()` handle kept on `globalThis` for `bun --hot`, worker starts, ordered shutdown steps
  migrate.ts                    Migration entry; `start` runs it before the server
  client.ts                     `hcWithType` factory, `hc<AppType>`
```

**Module boundary.** Within a module, layers import inwards (`infrastructure/` → `application/` → `domain/`). Modules never import each other, not even ports: they talk through domain events or a port the host binds. Enforced by `pnpm check:boundaries` (`.dependency-cruiser.cjs`). `module.ts` is imported only by `container.ts`, routes only by `app.ts`; re-exporting routes from `module.ts` recreates the cycle `module → routes → container → module`.

**Removability.** Trashing a module plus its `.addModule()` and `app.route()` lines must leave `tsc` pointing at every other line that named it.

## Module anatomy

The contract of a business module (anatomy, prerequisites, routes as factories) is `modules/CLAUDE.md`. The api-hosted modules follow it: `application/{ports,services,dto,config}`, `infrastructure/repositories`, `routes.ts` as `create<Name>Routes(deps)`, `module.ts` as `defineModule<<Name>Prerequisites>()`, tests under `__TESTS__/`.

**Do I need an aggregate?** The rule fits in `array.includes()`, `count(*)` or a config lookup → infra orchestration (`<Noun>Service`), stay flat. An entity has an invariant only it can enforce → aggregate. SQL counts are not invariants. Primitives: `packages/ddd-kit/CLAUDE.md`.

**Layer purity.** Domain imports only `@packages/ddd-kit` and `zod`. Application imports only those plus its own ports and types, never `@packages/drizzle`, `better-auth` or a provider type. **Why**: a use case importing a provider type survives a swap only by accident, which is what ports exist to prevent.

## Shared kernel (`shared/`)

Cross-cutting infra, no business; the rule is where a new file goes.

- `middleware/`: auth session, error handler, HTTP logger, rate-limit factory + policies + trusted-proxy IP, CSRF Origin allowlist.
- `ports/` + `services/`: cross-context ports (captcha, health, rate limiter) and the impls no module owns, plus the instrumentation impls and `notification-stream-hub.ts` (per-user SSE fan-out over Postgres `LISTEN`).
- `auth/unit-of-work-adapter.ts`: `asUnitOfWork`, which hands BetterAuth a `db` whose transactions are outermost units of work.
- `surface/`: back↔front route parity: live route table from `app.ts`, front `api.*.$method` call-site scan, `route-map.ts` with the intent of every route; `surface-parity.test.ts` fails on drift.
- `aead.ts` (XChaCha20-Poly1305 with HKDF sub-keys), `db-failure.ts`, `private-ranges.ts`, `request-context.ts` (request-scoped ALS: request id and trusted-proxy client IP, for BetterAuth hooks that have no Hono context), `shutdown.ts` (steps in series, each raced against its timeout, a global deadline).
- `env.ts`, `logger.ts`: process-level singletons. `env-schema.ts` holds the schema and the keys production requires, free of side effects; `env-bounds.ts` holds the cross-field refinements (lease vs budget, hosts, trusted proxies) so a test can call them without a full `.env`.

**Port placement.** The decisor is who consumes the port: two contexts or pure transport (email, push) → `shared/ports/`; one context with orchestration above it → `modules/<x>/application/ports/`. Promote on the second consumer, demote when it disappears.

## DI (inwire)

A module states what it needs in `<Name>Prerequisites` and what it adds through `.add()`; `container.ts` chains `.addModule(...)`, and inwire refuses at compile time a module whose prerequisites are not on the builder yet.

1. **`defineModule<<Name>Prerequisites>()` with its explicit generic**, never a global augmentation. **Why**: a module typed against everything sees every key, so its real dependencies are invisible and it cannot be type-checked on its own.
2. **Every host binding a module receives lives in `composition/`** (env → typed settings in `settings.ts`), and `app.ts` hands each route factory `di.scope({ routeGuards, ... })` with the host pieces a route needs beyond the container. **Why**: the wiring of every context reads in one folder.
3. **`scope`, never `extend`**: `extend` copies the resolved cache, so a stateful binding resolved after it would exist twice.
4. **All deps via DI**; never `new` a collaborator outside the container. A route reads `deps`, a test passes a plain `deps` object (`openRouteGuards()` from `@packages/http/testing/route-guards`).
5. **Transactions are opened by `uow.run` in use cases, services and route handlers; repositories read the ambient executor.** No port, store or service takes a transaction parameter; `src/__TESTS__/layering.test.ts` enforces it. **Why**: a handle threaded by hand is forgotten at one call site, and that write silently commits outside its unit.

## Domain events

Declaration, payload and actor contract: `packages/events/CLAUDE.md`. A write and its `emitEvent(outbox, ...)` share one `uow.run(async () => ...)`; stores and the outbox both read `resolveExecutor()`, so both land in the run's transaction. Aggregates `addEvent()` and the run flushes them into the outbox before commit; repositories call `EventCollector.collectFrom(aggregate)` once their write succeeded.

- A nested `uow.run()` joins the open transaction (no savepoint); a failed `Result` at any depth rolls the whole unit back and the outermost `run()` resolves to it; a throw rolls back and propagates. Return the failure, never throw a sentinel. Proven against Postgres by `check:uow-rollback`.
- A run that collected events without a flush handler rolls back with `EventsWithoutOutbox`.
- BetterAuth's adapter receives `db` through `asUnitOfWork`: each transaction it opens is a `runOutermost`, its hooks join it, and their events commit with the library's write.
- Handlers run after commit through the outbox relay (`packages/outbox/CLAUDE.md`); the env knobs (`OUTBOX_*`, `EMAIL_*`) are checked against the kit's settle margin at boot by `env-bounds.ts`. Proven by `check:outbox-lease`.

Full guide and BetterAuth bridge specifics: `docs/EVENTS.md`.

## Hono RPC

The API exports `AppType`; the app consumes it via `hono/client`. Routes **must be chained**: `app.use`/`app.onError` don't accumulate types, and a `registerXxx(app)` helper loses the chain. `package.json` subpath exports: `.` → `AppType` + runtime; `./app` → the `Hono` app; `./client` → `hcWithType`. Client usage rules: `apps/app/CLAUDE.md`.

## Logging & error handling

No `console.*` in production: logs go through `pino` (JSON in prod, `pino-pretty` in dev), HTTP through `hono-pino` keyed on `requestId`.

One `app.onError(createErrorHandler(instrumentation))`, no per-route `try/catch`. Envelope: `{ error: { code, message, requestId } }`; unknown → `500 INTERNAL_ERROR`, stack only outside prod. Domain and application return `Result<T, E>`; typed codes map to HTTP through `httpStatusFromCode` (`*_NOT_FOUND` → 404).

## Observability (`IInstrumentation`)

One port (`@packages/ddd-kit`): `startSpan`, `capture`, `addBreadcrumb`, `setSpanAttributes`, `flush`. `SentryInstrumentation` when `SENTRY_DSN` is set, else `LoggingInstrumentation`; every I/O class receives it by constructor. `import "./shared/services/sentry-init"` is the first import of `index.ts`.

- Outer span `{ name: "ClassName > methodName" }` around the method body; inner span `{ name: <sql>, op: "db.query" }` (or `op: "http.client"`) around the query or call; multi-query methods keep the outer only.
- `const exec = resolveExecutor()` outside the span callback; catch → `capture(err)` → `Result.fail(...)` or rethrow, never swallow.

## Ownership

Every user-owned row carries `user_id`; a repository puts the owner in the `WHERE`, a wrong owner reads as absent (`Option.none()`) and a write on it fails with `*_NOT_FOUND`, never 403. There is no organization scoping.

## Testing

BDD style, runner `bun test`. One test file per service, store, DTO or route file under `__TESTS__/`. Mock at port level with `mockPort<T>()` and `mockUnitOfWork()` (`@packages/test/bun`); `enqueuedEvents(outbox)` reads what a mocked outbox received.

- **Substitute through the seam the code already has** (constructor, `deps` object) before replacing a module. When a module must be replaced, spread the real one (`{ ...realEvents, X: stub }`), never hand-copy its surface.
- **Test files are isolated by the harness** (`--isolate`, `module-isolation.*.test.ts` is the canary pair). A verdict that moves with file order is a harness bug.
- **Logic that lives in SQL is proven against a real database**, never by a mocked transaction: a `check:*` script AND a step in `.github/workflows/ci.yml` in the same change.
- **A port never expresses absence as `T | null`**: `Option<T>`, with `null` only when mapping a driver row or serialising JSON.

## Commands

- **Tests**: `pnpm --filter api test` (`bun test --isolate --parallel`); a bare `bun test` drops file isolation. The tests read `apps/api/.env`, so run `pnpm bootstrap` then `scripts/worktree-db.sh` first.
- **Real-database checks**: `pnpm --filter api check:{uow-rollback,outbox-lease,wipe-rollback,token-sealing,child-sign-in}`. Each refuses any database but this worktree's local one (`requireLocalDatabase` from `@packages/test/db-check`: localhost, port 54329, `classroom_parents[_<slug>]`) and is wired in `.github/workflows/ci.yml`. Re-run the matching one after touching the code it covers.
