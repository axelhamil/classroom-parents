---
name: compliance-consent
description: Use when working on RGPD account deletion, the grace period, the account wipe, the legal pages or the sub-processors register. Trigger on "RGPD", "account deletion", "/me/delete", "grace period", "wipe", "pendingDeletionUntil", "legal page", "sub-processors". Not for generic security or auth work (skill auth-server).
---

# Compliance infra (RGPD deletion and legal pages)

Compliance infra, not DDD: a service over a store, no aggregate.

## Account deletion (`apps/api/src/modules/rgpd/`)

- **Routes** (`routes.ts`, mounted on `/me`, CSRF guarded): `POST /me/delete` (`requireAuth`, own rate limit, Zod body) → `RgpdService.requestAccountDeletion`; `DELETE /me/delete` → `cancelAccountDeletion`. Failures become `AppErrorException`, mapped by the central error handler.
- **Grace period**: a request sets `user.pendingDeletionUntil` to now + `RGPD_GRACE_PERIOD_DAYS` (BetterAuth additional field, `input: false`) and emits `user.deletion.requested`; a cancel clears it and emits `user.deletion.cancelled`. Both in one `uow.run`.
- **Wipe**: `executeAccountWipe` erases the account and emits `user.deleted`; `processPendingDeletions` walks the expired requests in batches of `RGPD_SWEEP_BATCH_SIZE` within the sweep deadline. No worker calls it yet: the periodic sweep is bound by T10 on the sweep pieces of `shared/internal-routes/` (no HTTP endpoint, no external cron).
- **Settings** come from `application/config/rgpd-settings.ts` (built from env, validated at boot), never read from `env` inside the service.
- **Proof**: `rgpd.service.test.ts` (scenarios per rule) and `pnpm --filter api check:wipe-rollback` (a failing wipe rolls the whole unit back against Postgres).

## Legal pages and sub-processors (`apps/app`)

- Routes under `src/features/legal/` and `src/features/privacy/`, listed once in `src/shared/legal-routes.ts` (footer and a11y gate read it).
- The sub-processors register is `src/shared/sub-processors.config.ts`, labels in `sub-processor-labels.ts`. A new third party that receives personal data is added there in the same change that wires it.
