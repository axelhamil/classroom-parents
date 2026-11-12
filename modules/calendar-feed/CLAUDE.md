# calendar-feed rules

A parent's private ICS subscription link (`GET /calendar/<secret>.ics`), one per parent, scoped to every child or a chosen list. Module contract: `modules/CLAUDE.md`.

## Invariants

1. **Only the SHA-256 of the secret is stored, and the secret leaves the server once**, in the response of the call that issues it. A lookup hashes the presented secret and reads by the unique hash, so the database never compares the secret itself. **Why**: a database dump or a log must never yield a working link to a family's deadlines.
2. **The secret travels in the URL path, so every sink that records a path redacts it** (`apps/api/src/shared/secret-path.ts`: HTTP log, error log, rate-limit event, Sentry events and transactions). A new sink that records a request path goes through it. **Why**: calendar clients only accept a plain URL, and query scrubbing does not see a path.
3. **Issuing again replaces the secret** (`calendar.feed.rotated`): the previous link dies at once. A revoke deletes the row (`calendar.feed.revoked`). Payloads carry `userId` only, the parent being both actor and subject.
4. **Fetching is a read** and emits nothing; `lastFetchedAt` is written at most once per hour (`FETCH_RECORD_INTERVAL_MS`) so a polling client never writes on every request.
5. **The feed route is limited per link and, for unknown links only, per address; never by the global per-address policy** (`apps/api/src/shared/middleware/calendar-rate-limit.ts`). An address that spends its miss budget is refused on every link until the window resets. **Why**: one calendar server polls many parents' links from one address, while a guesser must not learn which guess hit.

## Ports

- `IFeedChildren`: the parent's visible child ids, to refuse a scope naming a child that is not theirs.
- `IFeedEntries`: confirmed events from 30 days back onwards with child label, category label and planned reminder times, bound in `apps/api/src/composition/bindings.ts` (`feedEntriesFor`) over the agenda's visibility rules and the alerts table (`apps/api/src/queries/feed-alarms.query.ts`).
