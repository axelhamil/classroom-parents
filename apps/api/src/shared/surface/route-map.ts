import type { RouteKey } from "./back-routes";

/**
 * Why a live route has no front consumer. Each value is a claim someone can
 * check, "dormant" is not a synonym for "unused", it is a commitment that the
 * capability ships ready for its first consumer (spec D5).
 */
export type UiLessReason =
  | "infra-probe" // health/readiness, called by the platform
  | "internal-cron" // /internal/*, signature-guarded, called by the scheduler
  | "public-api" // /api/v1/*, consumed by third parties holding a token
  | "provider-callback" // webhook/IdP receiver, called by an external service
  | "library-owned" // opaque surface, route table owned by a dependency
  | "dormant-by-design"; // shipped ready for a consumer that does not exist yet

export type SurfaceEntry = { consumer: string } | { uiLess: UiLessReason };

export const ROUTE_MAP: Record<RouteKey, SurfaceEntry> = {
  "ALL /api/auth/*": { uiLess: "library-owned" },
  "DELETE /admin/users/:id/sessions": { uiLess: "dormant-by-design" },
  "DELETE /consents": { consumer: "apps/app/src/shared/api/mutations/withdraw-consent.ts" },
  "DELETE /me/delete": { consumer: "apps/app/src/shared/api/mutations/cancel-account-deletion.ts" },
  "DELETE /settings/organization/scim-connection": {
    consumer: "apps/app/src/features/sso/api/sso.mutations.ts",
  },
  "DELETE /settings/tokens/:id": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.mutations.ts",
  },
  "DELETE /settings/webhooks/:id": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "DELETE /uploads": { consumer: "apps/app/src/shared/api/mutations/create-upload.ts" },
  "DELETE /admin/staff/:id": { uiLess: "dormant-by-design" },
  "GET /admin/approvals": { uiLess: "dormant-by-design" },
  "GET /admin/approvals/:id": { uiLess: "dormant-by-design" },
  "POST /admin/approvals/:id/decide": { uiLess: "dormant-by-design" },
  "POST /admin/approvals/:id/cancel": { uiLess: "dormant-by-design" },
  "GET /admin/audit-log": { uiLess: "dormant-by-design" },
  "GET /admin/audit-log/verify": { uiLess: "dormant-by-design" },
  "GET /admin/me": { uiLess: "dormant-by-design" },
  "POST /admin/step-up": { uiLess: "dormant-by-design" },
  "GET /admin/orgs": { uiLess: "dormant-by-design" },
  "GET /admin/orgs/:id": { uiLess: "dormant-by-design" },
  "GET /admin/staff/:id/overrides": { uiLess: "dormant-by-design" },
  "POST /admin/staff/:id/overrides": { uiLess: "dormant-by-design" },
  "DELETE /admin/staff/:id/overrides/:overrideId": { uiLess: "dormant-by-design" },
  "GET /admin/ops/dead-letters": { uiLess: "dormant-by-design" },
  "GET /admin/ops/stripe-events": { uiLess: "dormant-by-design" },
  "GET /admin/ops/sweeps": { uiLess: "dormant-by-design" },
  "POST /admin/ops/outbox/requeue": { uiLess: "dormant-by-design" },
  "POST /admin/ops/stripe-events/:id/replay": { uiLess: "dormant-by-design" },
  "GET /admin/orgs/:id/notes": { uiLess: "dormant-by-design" },
  "POST /admin/orgs/:id/notes": { uiLess: "dormant-by-design" },
  "POST /admin/orgs/:id/plan-override": { uiLess: "dormant-by-design" },
  "DELETE /admin/orgs/:id/plan-override": { uiLess: "dormant-by-design" },
  "GET /admin/users/:id/notes": { uiLess: "dormant-by-design" },
  "POST /admin/users/:id/notes": { uiLess: "dormant-by-design" },
  "GET /admin/inbox": { uiLess: "dormant-by-design" },
  "GET /admin/views": { uiLess: "dormant-by-design" },
  "POST /admin/views": { uiLess: "dormant-by-design" },
  "DELETE /admin/views/:id": { uiLess: "dormant-by-design" },
  "GET /admin/staff": { uiLess: "dormant-by-design" },
  "GET /admin/users": { uiLess: "dormant-by-design" },
  "GET /admin/users/:id": { uiLess: "dormant-by-design" },
  "GET /api/v1/me": { uiLess: "public-api" },
  "GET /api/v1/organizations": { uiLess: "public-api" },
  "GET /billing/plans": { consumer: "apps/app/src/shared/api/queries/billing-plans.ts" },
  "GET /billing/subscription": { consumer: "apps/app/src/shared/api/queries/subscription.ts" },
  "GET /consents": { consumer: "apps/app/src/shared/api/queries/consent.ts" },
  "GET /internal/build-info": { uiLess: "internal-cron" },
  "GET /livez": { uiLess: "infra-probe" },
  "GET /me/delete/preflight": {
    consumer: "apps/app/src/shared/api/queries/account-deletion.ts",
  },
  "GET /me/policies": { consumer: "apps/app/src/shared/api/queries/policies.ts" },
  "GET /notifications": { consumer: "apps/app/src/shared/api/queries/notifications.ts" },
  "GET /notifications/org-preferences": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /notifications/preferences": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /notifications/stream": {
    consumer: "apps/app/src/shared/notifications/use-notification-stream.ts",
  },
  "GET /notifications/unread-count": {
    consumer: "apps/app/src/shared/api/queries/notifications.ts",
  },
  "GET /readyz": { uiLess: "infra-probe" },
  "GET /settings/organization/scim-connection": {
    consumer: "apps/app/src/features/sso/api/sso.queries.ts",
  },
  "GET /settings/tokens": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.queries.ts",
  },
  "GET /settings/webhooks": { consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts" },
  "GET /settings/webhooks/:id/deliveries": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts",
  },
  "GET /settings/webhooks/:id/deliveries/:deliveryId": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.queries.ts",
  },
  "GET /startupz": { uiLess: "infra-probe" },
  "PATCH /api/v1/me": { uiLess: "public-api" },
  "PATCH /settings/webhooks/:id": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /admin/impersonation/:id/start": { uiLess: "dormant-by-design" },
  "POST /admin/impersonation/stop": {
    consumer: "apps/app/src/shared/api/mutations/stop-impersonation.ts",
  },
  "POST /admin/orgs/:id/sso-enforcement": { uiLess: "dormant-by-design" },
  "POST /admin/users/:id/ban": { uiLess: "dormant-by-design" },
  "POST /admin/users/:id/reset-password": { uiLess: "dormant-by-design" },
  "POST /admin/users/:id/unban": { uiLess: "dormant-by-design" },
  "POST /api/token-scanning/github": { uiLess: "provider-callback" },
  "POST /billing/portal": { consumer: "apps/app/src/shared/api/mutations/open-billing-portal.ts" },
  "POST /consents": { consumer: "apps/app/src/shared/api/mutations/record-consent.ts" },
  "POST /csp-report": { uiLess: "provider-callback" },
  "POST /internal/flush-notification-emails": { uiLess: "internal-cron" },
  "POST /internal/rgpd-sweep": { uiLess: "internal-cron" },
  "POST /internal/sweep-admin-approvals": { uiLess: "internal-cron" },
  "POST /internal/sweep-admin-impersonations": { uiLess: "internal-cron" },
  "POST /internal/sweep-audit-log": { uiLess: "internal-cron" },
  "POST /internal/sweep-consents": { uiLess: "internal-cron" },
  "POST /internal/sweep-email-messages": { uiLess: "internal-cron" },
  "POST /internal/sweep-notifications": { uiLess: "internal-cron" },
  "POST /internal/sweep-stripe-events": { uiLess: "internal-cron" },
  "POST /internal/sweep-outbox": { uiLess: "internal-cron" },
  "POST /internal/sweep-webhook-delivery": { uiLess: "internal-cron" },
  "POST /me/delete": { consumer: "apps/app/src/shared/api/mutations/request-account-deletion.ts" },
  "POST /me/export": { consumer: "apps/app/src/shared/api/mutations/request-data-export.ts" },
  "POST /me/policies/accept": { consumer: "apps/app/src/shared/api/mutations/accept-policies.ts" },
  "POST /notifications/read": { consumer: "apps/app/src/shared/api/mutations/notifications.ts" },
  "POST /notifications/read-all": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
  "POST /settings/organization/scim-connection": {
    consumer: "apps/app/src/features/sso/api/sso.mutations.ts",
  },
  "POST /settings/organization/sso-enforcement": {
    consumer: "apps/app/src/features/sso/api/sso.mutations.ts",
  },
  "POST /settings/tokens": {
    consumer: "apps/app/src/features/api-tokens/api/api-tokens.mutations.ts",
  },
  "POST /settings/webhooks": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/deliveries/:deliveryId/replay": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/rotate-secret": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /settings/webhooks/:id/test": {
    consumer: "apps/app/src/features/webhooks/api/webhooks.mutations.ts",
  },
  "POST /uploads/confirm": { consumer: "apps/app/src/shared/api/mutations/create-upload.ts" },
  "POST /uploads/download": { uiLess: "dormant-by-design" },
  "POST /uploads/presign": { consumer: "apps/app/src/shared/api/mutations/create-upload.ts" },
  "PUT /admin/staff/:id/role": { uiLess: "dormant-by-design" },
  "PUT /me/locale": { consumer: "apps/app/src/shared/api/mutations/set-locale.ts" },
  "PUT /notifications/org-preferences": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
  "PUT /notifications/preferences": {
    consumer: "apps/app/src/shared/api/mutations/notifications.ts",
  },
};
