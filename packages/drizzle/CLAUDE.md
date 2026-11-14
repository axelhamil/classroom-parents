# drizzle rules

The database package: Drizzle client, schema, migrations and the transaction service. Auto-loaded under `packages/drizzle/`. Consumers: `apps/api` (stores, repositories, BetterAuth adapter, real-database scripts) and the `modules/*` repositories and schemas. Cross-cutting rules: `/CLAUDE.md`; server usage: `apps/api/CLAUDE.md`.

## Layout

```
drizzle.config.ts              drizzle-kit config (schema "./src/schema/*", out "./migrations")
migrations/                    generated SQL, committed (regenerated as one `0000_*.sql` by T10)
src/
  config.ts                    `db`, `DbClient`, `Transaction`, `closeDb()` (ends the pool, called by the api shutdown), `configureDbPool(max)` (the host sizes the pool before the first query)
  schema/<topic>.ts            one file per topic (auth, email, outbox, rate-limit, sweep), re-exported as `<topic>Schema` from `index.ts`
  db-failure.ts                `dbOperationFailure(code)`: the error a store returns when a query throws
  advisory-lock.ts             `lockForTransaction`, `tryLockForTransaction` (transaction scoped advisory lock)
  services/                    `TransactionService` (the `IUnitOfWork` impl)
  seeds/                       dev seeds
  rate-limit-client.ts         dedicated pool for the rate-limiter store, `closeRateLimitDb()`, `configureRateLimitDbPool(max)`
```

## Rules

1. **The package is the only importer of `drizzle-orm`.** Query helpers (`and`, `eq`, `inArray`, `isNull`, `arrayContains`, `sql`, ...) are re-exported from `index.ts`; a consumer imports them from `@packages/drizzle`. A missing helper is added to the re-export list, never imported from `drizzle-orm` in an app. **Why**: one place to swap or pin the ORM, and the workspace boundary stays checkable.
2. **Typed builder first, raw SQL last.** `select`/`insert`/`update`/`delete` and the helpers cover filters, array operators and row locks (`.for("update", { skipLocked: true })`). A `sql` fragment is acceptable only for DDL, session-scoped tuning (`SET LOCAL ...`) or an operator with no helper (search the exports first), and keeps its columns typed (`${table.col}`). **Why**: the typed builder catches rename and type drift at compile time; raw SQL rots until a runtime exception.
3. **Every user-owned table carries `userId NOT NULL` + FK `user(id) ON DELETE CASCADE` from its first migration** (directly, or through a parent row that carries it). **Why**: ownership is filtered in the repository `WHERE`, and a missing cascade leaves orphans after an account deletion. The outbox is the exception: it keeps no owner column, so the account wipe deletes the rows whose payload names the user (`userId` or `actorUserId`), and only `user.deleted` remains.
4. **A new table's primary key defaults to `uuid("id").primaryKey().default(sql`uuidv7()`)`** (native in Postgres 18): time-ordered, so inserts avoid the B-tree hotspot of a random uuid. The BetterAuth tables keep their `text` ids, which the library generates.
5. **A schema change ships with its migration**: every database, local ones included, is built by `db:generate` + `db:migrate`; `db:push` is for a throwaway database only. Touch an existing schema as little as possible.

## Unit of work

`TransactionService implements IUnitOfWork`; no transaction handle crosses its interface. It takes the kit's `IInstrumentation` port.

- `run(cb)` opens the ambient scope (transaction + `EventCollector` buffer), runs `cb()`, drains the collected events and hands them to the `FlushHandler` (the outbox) before commit, so the writes and their events are atomic.
- The outermost `run()` opens `db.transaction` and publishes it in `UnitOfWorkContext`; a nested `run()` joins it (no savepoint, no second connection) and its events are kept for the outermost flush. A failed `Result` at any depth marks the unit rollback-only (first failure kept) and the outermost `run()` resolves to it; a nested throw dooms it too, and the outermost `run()` rethrows that error even when the outer work caught it. **Why no savepoint**: `rollback to savepoint` cannot un-collect the in-memory event buffer, so a partial rollback would still emit events.
- `runOutermost(cb)` always opens its own transaction on its own connection and masks any ambient one, with the same flush and rollback rules. It exists for a library whose transaction must commit on its own (the BetterAuth adapter, `apps/api`): joined to an app run, the library's reads on the pool miss its uncommitted writes and its change no longer commits when it says so.
- Events collected by a run built without a `FlushHandler` throw `EventsWithoutOutbox` (naming the event types) at flush and roll the unit back. **Why**: a commit that drops its events is a silent audit and integration gap; the api container always passes the outbox enqueue, so only a mis-wired run fails.
- `ambientTransaction()` is the one accessor for the open transaction (`Option<Transaction>`); `resolveExecutor()` returns it, else `db`; `savepoint(work)` runs `work` on a savepoint of the executor, in its own scope. App code never reads `UnitOfWorkContext` itself, so the unchecked cast to the driver type lives in one place.
- A lock held until the transaction ends goes through `lockForTransaction(key)` (waits) or `tryLockForTransaction(key)` (gives up, returns `false`), both on `resolveExecutor()`. Outside a run the lock is released at once, so take it inside one. **Why the key and its hash never change**: during a deploy the old and the new instance run side by side, and a different key or hash makes them miss each other's lock.
- The scope is closed when its run settles, so a promise that outlives the run gets `db`. **Why**: node-postgres does not guard a query on a released client, it may run on a connection another borrower holds.
- A callback that resolves to a failed `Result` rolls everything back (writes and events) and `run()` resolves to that `Result`; return the failure, never throw a sentinel. Proven against Postgres by `check:uow-rollback` (`apps/api`).
- A repository's `save`/`create` calls `EventCollector.collectFrom(aggregate)` once the write succeeded, otherwise the events stay on the aggregate and are silently lost.
- `run()` does not capture errors: it rethrows to a caller that knows whether the throw is expected, and the central error handler reports the unexpected ones. Capturing here would double-report every 5xx.

## Commands

`pnpm db:push` · `db:generate` · `db:migrate` · `db:seed` · `db:studio` (root scripts, run through Turbo; `.env` comes from `pnpm bootstrap`) · `pnpm --filter @packages/drizzle type-check`.
