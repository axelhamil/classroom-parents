---
name: compliance-consent
description: Use when working on RGPD account deletion, the grace period, the account wipe, the legal pages or the sub-processors register. Trigger on "RGPD", "account deletion", "/me/delete", "grace period", "wipe", "pendingDeletionUntil", "legal page", "sub-processors". Not for generic security or auth work (skill auth-server).
---

# Compliance infra (RGPD deletion and legal pages)

Compliance infra, not DDD: a service over a store, no aggregate.

## Account deletion (`apps/api/src/modules/rgpd/`)

- **Routes** (`routes.ts`, mounted on `/me`, CSRF guarded): `POST /me/delete` (`requireAuth`, own rate limit, no body) → `RgpdService.requestAccountDeletion`, which asks for no password (parents sign in with Google only) but for a session started less than `freshSessionMaxAgeMs` ago (`SESSION_FRESH_AGE_SECONDS`, also BetterAuth's `session.freshAge`), else `ACCOUNT_REAUTH_REQUIRED` (403: sign in with Google again); `DELETE /me/delete` → `cancelAccountDeletion`. Failures become `AppErrorException`, mapped by the central error handler.
- **Grace period**: a request sets `user.pendingDeletionUntil` to now + `RGPD_GRACE_PERIOD_DAYS` (BetterAuth additional field, `input: false`) and emits `user.deletion.requested`; a cancel clears it and emits `user.deletion.cancelled`. Both in one `uow.run`. Both writes are guarded in their `WHERE` (mark only when nothing is pending, clear only while the deadline is ahead): a repeated request is announced once, and a cancel once the deadline has passed fails with `ACCOUNT_DELETION_CANCEL_CONFLICT` (409).
- **Wipe**: `executeAccountWipe` first revokes every child Google token through the `IChildConnections` port (best effort: a refusal or a failure is logged, never blocks the erasure), then in one `uow.run` deletes the user row only while its deadline has passed (children, sessions, accounts and sealed tokens follow by FK cascade; a cancel accepted meanwhile wins and the wipe reports `alreadyWiped`), purges the outbox rows whose payload names the user as `userId` or `actorUserId` and every queued email to the user's address, emits `user.deleted` (no PII) and queues the confirmation email with `eraseOnSettle`, so its row and the address leave the queue once sent or refused, or at its final death past the dead replay window (24 h at most); a failure of any step rolls all of it back; `processPendingDeletions` walks the expired requests in batches of `RGPD_SWEEP_BATCH_SIZE` within the sweep deadline. No worker calls it yet: the periodic sweep is bound by T10 on the sweep pieces of `shared/internal-routes/` (no HTTP endpoint, no external cron).
- **Data export** (right of access and portability): `POST /me/export` (`requireAuth`, CSRF guarded, POST so a cross-site navigation cannot burn the parent's quota) → `DataExportService.requestExport` returns the JSON document as an attachment `classroom-parents-export-<Paris date>.json`. In one `uow.run`: the user row is locked, a request less than 24 h after `user.lastDataExportAt` fails with `DATA_EXPORT_RATE_LIMITED` (429, `metadata.retryAt`), else the date is stored, the data is read and `user.data_export.requested` is emitted; a failed read rolls the date back. The cross-module read is the host query `queries/user-data.query.ts` behind `IUserDataReader`; it never selects a token or a push key (endpoint host only). A new user-owned table goes into that query and into the wipe proof below in the same change, with an `ON DELETE CASCADE` foreign key to the user (or to a row that has one). **Proof**: `data-export.service.test.ts` and `check:data-export`.
- **Settings** come from `application/config/rgpd-settings.ts` (built from env, validated at boot), never read from `env` inside the service.
- **Proof**: `rgpd.service.test.ts` (scenarios per rule) and `pnpm --filter api check:wipe-rollback` (rollback, cascade of every user-owned table, outbox purge, grace period and the Google-only fresh-session request, against Postgres).

## Legal pages and sub-processors (`apps/app`)

- Routes under `src/features/legal/` and `src/features/privacy/`, listed once in `src/shared/legal-routes.ts` (footer and a11y gate read it).
- The sub-processors register is `src/shared/sub-processors.config.ts`, labels in `sub-processor-labels.ts`. A new third party that receives personal data is added there in the same change that wires it.
