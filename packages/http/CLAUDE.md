# http rules

The HTTP kit a module's routes are written against: the zod request validator, time-id cursor pagination and the route-guard contract. Auto-loaded under `packages/http/`. Consumer: `apps/api` (and every `@modules/<name>` once modules move). Server conventions (RPC chaining, error envelope): `apps/api/CLAUDE.md`.

## Layout

```
src/
  validator.ts                 `zV`: a failed parse throws `REQUEST_INVALID` (fields in `metadata`) to the host error handler, so the RPC response type stays clean
  time-id-cursor.ts            keyset cursor on `(time, id)`: `timeIdCursorSchema` (decode), `encodeTimeIdCursor`, `afterTimeIdCursor` (`WHERE`, newest first by default, `"asc"` for oldest first), `exactInstant`
  route-guards.ts              `RouteGuards` contract, `RouteGuard`, `RouteEnv`
  testing/route-guards.ts      `openRouteGuards(requester)`: every gate open, for a module's route tests
```

## Rules

1. **The package declares the guards, the host implements them.** `RouteGuards` lists the gates a route may stack (`requireAuth`) and the request reads that depend on them (`currentUserId`, `signedInUserId`, `clientIp`, `currentSession`), so a route never types the session itself; no guard is implemented here. The host implements it from its middlewares and hands it to the modules that mount routes. **Why**: a guard needs the session, which is host infrastructure; implemented in the kit, it would drag that infrastructure into every module that imports a route helper.
2. **The package reads no environment and writes no row.** `src/__TESTS__/layering.test.ts` enforces it.
