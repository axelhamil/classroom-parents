---
name: events-outbox
description: Use when working on domain events, the transactional outbox, the BetterAuth event bridge, event retention or sweeps. Trigger on "outbox", "domain event", "emitEvent", "addEvent", "uow.run", "OutboxDispatcher", "databaseHooks", "onEvent", "retention", "sweep".
---

# Events (transactional outbox)

`IUnitOfWork.run(cb)` opens an `EventCollector`. `repo.save(agg)` reads the ambient transaction and calls `EventCollector.collectFrom(agg)` once the write succeeded → events flushed via `outbox.enqueue` in the same TX (atomicity). `enqueue` also sends `pg_notify` on the same executor, so it leaves at commit and wakes `OutboxDispatcher`; its `OutboxRelay` claims due rows by lease (one statement, no transaction kept open) and runs every handler declared with `onEvent(type, handlerName, ...)` not yet in the row's `deliveries`, each in its own short transaction, then settles with `markDelivered` or `markFailed` guarded by the claimed `attempts`.

## BetterAuth → outbox bridge (`auth.ts`)

- **`databaseHooks` for core models** (user/session/account), TX-bound, all flows: `USER_CREATED`, `USER_SIGNED_IN`, `USER_ACCOUNT_UNLINKED`.
- **`hooks.after` + `createAuthMiddleware` for path events** (`/verify-email`, `/update-user`, `/link-social`). **Guard `if (ctx.context.returned instanceof APIError) return`**, otherwise events fire on 4xx.
- **`hooks.before` + `createAuthMiddleware` for pre-rejection signals** (per-account sign-in rate limit): emits before `throw APIError`. **Trap**: `ctx.context.request`/`ctx.context.session` are `undefined` in before-hooks, read the IP from `ctx.headers`. Wiring `ctx.context.*` throws before the emit → event silently lost + 500. Only end-to-end tests catch this (unit tests don't mount hooks).

Emit sites per type: `docs/EVENTS.md`; the parity test fails on a catalog type with none.

## Hard rules

A nested `uow.run()` joins the open transaction (no savepoint); a failed `Result` or a throw at any depth rolls the whole unit back, even when the outer work caught it; a BetterAuth transaction is a `runOutermost`, its own connection, never joined to an app run; a run's scope is closed when it settles, so a late promise reads the pool; a run with collected events and no flush handler rolls back (`EventsWithoutOutbox`). No store, port or service takes a `tx`: `run(work)` hands `work` nothing and the store (outbox enqueue included) reads `resolveExecutor()`; the open transaction is read through `ambientTransaction()`, never `UnitOfWorkContext`. `addEvent` outside `uow.run()` = events lost (dev-mode warning via `EventCollector.setOutOfContextLogger`).

Relay, lease and handler contract (idempotent on the event id, failure surfaced and never captured, release on shutdown, dead after the max attempts and announced once): `packages/outbox/CLAUDE.md`. Specific to wiring a handler: `handlerName` is a persisted key (kebab-case, unique per type), renaming one reruns it on every pending event; an external call passes an idempotency key derived from the handler name and the event id. Proof against Postgres: `check:outbox-lease`.

## Retention

Delivered `outbox_event` rows and settled emails are purged by the sweep helpers of `apps/api/src/shared/internal-routes/` (`sweep-runner`, `sweep-lock`, `sweep-purge`, `sweep-count`) under the `sweep_lock` table, each run recorded in `sweep_run`. The worker that drives them is bound in process (T10), no HTTP endpoint. The outbox purge removes only delivered rows (`dispatched_at < cutoff`): a dead row that never delivered is kept until a replay succeeds. The sweep emits no event (root rule 6 exception).

See [`docs/EVENTS.md`](../../docs/EVENTS.md) for the full spec.
