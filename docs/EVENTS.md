# Event-driven foundation: DX guide

The api ships a transactional outbox and an in-process dispatcher. You declare events and handlers; the rail delivers them. Catalog rules (declaration, payload contract, actor): `packages/events/CLAUDE.md`. Delivery internals: [EVENT_PIPELINE.md](./EVENT_PIPELINE.md).

## Deployment requirements

The dispatcher is an **in-process Bun worker** holding a persistent `pg.Client` on `LISTEN outbox_event`; the email delivery worker polls. Both die with the api process, so the api runs as a long-lived process (a VM, a container platform, `min_instances ≥ 1` on scale-to-zero platforms). Serverless functions and edge runtimes are not supported: nothing would drain `outbox_event`.

**Symptom of mis-deployment**: the api answers requests and `outbox_event` rows accumulate with `dispatched_at` null.

## Mental model

```
your code           ─►  uow.run(async () => repo.save(aggregate))
                                          │
                                          ▼ ALS collector flushes pre-COMMIT
                       outbox_event INSERT + pg_notify (same TX, delivered at COMMIT)
                                          │
                                          ▼
                                  OutboxDispatcher (in-process Bun worker)
                                          │
             OutboxRelay claims by lease: one statement, FOR UPDATE SKIP LOCKED,
             attempts + 1, next_attempt_at = now() + lease; no transaction stays open
                                          │
          every handler not yet in `deliveries`, each one in its own short transaction
                                          ▼
                              handlers declared with onEvent(type, name, ...)
                                          │
          all succeeded → markDelivered       one failed → markFailed: `deliveries` merged,
                                              `last_error` names it, retried with jitter
```

**Key invariant**: no lock and no transaction is held while a handler runs. Every handler is named, runs at least once and is retried alone until it succeeds: `deliveries` records which handlers already succeeded, so a retry runs only the ones that failed. A handler is therefore idempotent on the event id.

## How to emit a new event

1. Declare the type, payload, retention, visibility and description (the five files listed in `packages/events/CLAUDE.md`).
2. Emit it inside the unit of work of the write:
   - from an aggregate: `aggregate.addEvent(...)`, and the repository calls `EventCollector.collectFrom(aggregate)` (`@packages/ddd-kit`) once its write succeeded; without that call the events stay on the aggregate and are lost;
   - from a service or a library hook: `emitEvent(outbox, EventTypes.X, aggregateType, aggregateId, payload)` (`@packages/outbox/event-emitter`).
3. Both paths land in the transaction opened by `uow.run(...)`: the event commits with the write or not at all.

**Actor**: when the actor differs from the subject, the payload carries `actorUserId` as a separate, NOT NULL field (root rule 7). The `enqueue` guard catches a payload of the wrong shape, not a semantically missing actor: that is on the schema author.

## How to add an in-process handler

```ts
b.add(
  "NotifyParentOnDeadline",
  onEvent(EventTypes.X, "alerts-notify-parent", (c) => async (event) => {
    // call a port, return a Result
  }),
);
```

`OutboxDispatcher.start(di)` discovers every binding built by `onEvent` at boot (`EVENT_HANDLER_SYMBOL` marker, `packages/ddd-kit/src/events/`). **No registration array.** The handler name is a persisted key (kebab-case, unique per event type, `<module>-<reaction>`): renaming it reruns the handler on every pending event, and two handlers with the same name on one type are refused at boot (`DUPLICATE_HANDLER`). A handler that talks to the outside world passes an idempotency key derived from its name and the event id, so a redelivery never sends twice.

A handler that throws, returns a failed `Result` or runs past `OUTBOX_HANDLER_BUDGET_SECONDS` is a failed delivery: the event is retried with only that handler, and the relay logs and reports the failure itself. Never swallow an error or capture it in the handler: a swallowed error is a delivery the relay believes succeeded, a captured one is reported twice.

## Delivery: lease, retry and dead replay

The outbox (`outbox_event`) and the email queue (`email_message`) share one delivery model: claim in SQL with the database clock, settle guarded by the claimed `attempts`, keep a dead state replayed on a slow cadence, give the attempt back on shutdown. The shared SQL fragments (`dbNow`, `leasedBy`, `claimedSet`, `releasedSet`) live in `packages/drizzle/src/lease.ts`, the failure schedule (`failureSchedule`, `retryAfterSeconds`) in `packages/outbox/src/jitter.ts`.

1. **Claim by lease.** One statement selects the due rows (`FOR UPDATE SKIP LOCKED`, oldest first), increments `attempts` and pushes `next_attempt_at` to `now() + OUTBOX_LEASE_SECONDS`. No lock survives it; a relay that dies mid batch leaves rows that become claimable again when the lease expires. The claim size is capped at what the lease can process, and dead replays take at most a quarter of a claim, so a dead backlog never starves live events.
2. **Run the handlers.** Up to `OUTBOX_CONCURRENCY` events settle in parallel; every handler subscribed to the type and absent from `deliveries` runs, raced against the handler budget. A type with no handler in the process stays pending.
3. **Settle, guarded by the claim.** All handlers succeeded → `markDelivered` sets `dispatched_at`. Otherwise `markFailed` merges the successful handlers into `deliveries`, writes a scrubbed `last_error` and schedules the retry with decorrelated jitter. Both writes match `id`, the claimed `attempts` and `dispatched_at is null`: a settle that arrives after another relay reclaimed the row writes nothing.
4. **Dead, then replayed.** After `OUTBOX_MAX_ATTEMPTS` the row gets `dead_at` and is replayed every `OUTBOX_DEAD_RETRY_HOURS`. The first death enqueues one internal `outbox.event_dead` in the same unit of work as the `dead_at` write. A fixed handler drains the dead backlog on its own.
5. **Shutdown gives the attempt back**: unstarted or abandoned rows get `attempts - 1` and are due at once, never dead.

**Bookkeeping is not a state change**: `attempts`, `deliveries`, `dead_at` and the lease emit nothing (root rule 6 exception); the death of an event is the one fact announced, once.

| Knob (`apps/api/.env.example`) | Default | Effect |
|---|---|---|
| `OUTBOX_LEASE_SECONDS` | 120 | How long a claimed row stays invisible; at least the handler budget + 10 s (checked at boot) |
| `OUTBOX_HANDLER_BUDGET_SECONDS` | 30 | Time a handler gets before it is failed as `timed out` |
| `OUTBOX_CONCURRENCY` | 4 | Events settled in parallel by one relay |
| `OUTBOX_MAX_ATTEMPTS` | 10 | Failed attempts before an event is dead |
| `OUTBOX_DEAD_RETRY_HOURS` | 6 | Replay cadence of a dead event |

**Email queue differences**: live rows are `status = 'pending'`, the dead marker is `status = 'dead'`, a permanent rejection goes straight to the terminal `failed`; a row is dead after 4 failed sends and announces `email.delivery.exhausted` on its first death; a dead email is replayed only while it is younger than `EMAIL_DEAD_REPLAY_WINDOW_HOURS`, so a stale link is never sent late. Knobs: `EMAIL_LEASE_SECONDS`, `EMAIL_DEAD_RETRY_HOURS`, `EMAIL_DEAD_REPLAY_WINDOW_HOURS` (bounds checked at boot by `env-bounds.ts`).

Proven against Postgres by `pnpm --filter api check:outbox-lease` (disjoint concurrent claims, lease expiry, stale settle, `deliveries` merge, dead replay, release without penalty, rolled back enqueue, retention purge).

## Retention

Delivered outbox rows and settled emails are derived data. The purge helpers stay in `apps/api/src/shared/internal-routes/` (`sweep-purge`, `sweep-lock`, `sweep-runner`, `sweep-count`, `sweep-span`, `sweep-heartbeat`) with the `sweep_lock` and `sweep_run` tables; the periodic worker that calls them is bound by the host (no HTTP endpoint, no external cron). A retention purge never deletes a dead outbox row: it removes only rows with `dispatched_at` set and older than the cutoff (`OUTBOX_RETENTION_DAYS`, 7 days, hourly next to the email sweep). The RGPD account wipe is another path: it deletes every row whose payload names the user (`userId` or `actorUserId`), dead rows included, and only `user.deleted` remains. Deleting aged derived rows emits nothing (root rule 6 exception).

## Visibility: public vs internal events

`packages/events/src/visibility-map.ts` classifies every `EventType` as `public` (may leave the server, for example to the user it concerns) or `internal` (never exposed: security signals, delivery bookkeeping). Promoting an event to `public` makes its type string and payload a contract; internal events can be reshaped freely.

## BetterAuth bridge and emit sites

- `apps/api/src/auth.ts`, `databaseHooks` (bound to the library's transaction through `asUnitOfWork`): `user.created` (`user.create.after`), `user.signed_in` (`session.create.after`), `user.account.linked` (`account.create.after`, `google-classroom` child accounts only, `shared/auth/child-accounts.ts`), `user.account.unlinked` (`account.delete.after`), `user.session.revoked` (`session.delete.after`, only under `/revoke-session`, `/revoke-sessions` and `/revoke-other-sessions`: a sign-out or an expiry ends a session without revoking it). The same unit of work removes the revoked session's push subscriptions through `PushSubscriptionService.forgetSession`, which emits `alert.push_subscription.unsubscribed` per subscription; an expired session keeps its subscriptions.
- `apps/api/src/auth.ts`, `hooks.after` (path based, skipped when the endpoint returned an `APIError`): `user.email_verified` (`/verify-email`), `user.profile.updated` (`/update-user`, field-level diff).
- `apps/api/src/auth.ts` and `shared/middleware/rate-limit.middleware.ts`: `security.rate_limit.exceeded`; `shared/middleware/csrf.middleware.ts`: `security.csrf.rejected` (nullable actor, no trusted session on a rejection).
- `apps/api/src/modules/rgpd`: `user.deletion.requested`, `user.deletion.cancelled`, `user.deleted`.
- `packages/email`: `email.delivery.exhausted`; `packages/outbox`: `outbox.event_dead` (the worker is the actor, `actorUserId: null`).

`apps/api/src/__TESTS__/event-catalog-parity.test.ts` fails on a catalog type with no emit site.
