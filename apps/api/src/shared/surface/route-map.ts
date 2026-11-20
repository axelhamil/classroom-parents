import type { RouteKey } from "./back-routes";

/**
 * Why a live route has no front consumer. Each value is a claim someone can
 * check, "dormant" is not a synonym for "unused", it is a commitment that the
 * capability ships ready for its first consumer (spec D5).
 */
export type UiLessReason =
  | "infra-probe" // health/readiness, called by the platform
  | "library-owned" // opaque surface, route table owned by a dependency
  | "dormant-by-design" // shipped ready for a consumer that does not exist yet
  | "external-client"; // fetched by a third-party client holding its own secret, never by the front

export type SurfaceEntry = { consumer: string } | { uiLess: UiLessReason };

export const ROUTE_MAP: Record<RouteKey, SurfaceEntry> = {
  "ALL /api/auth/*": { uiLess: "library-owned" },
  "DELETE /children/:id": { consumer: "apps/app/src/features/children/api/children.mutations.ts" },
  "DELETE /events/:id": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "DELETE /me/delete": { consumer: "apps/app/src/shared/api/mutations/cancel-account-deletion.ts" },
  "GET /me/delete/preflight": { consumer: "apps/app/src/features/rgpd/api/rgpd.queries.ts" },
  "GET /calendar-feed": { consumer: "apps/app/src/features/events/api/events.queries.ts" },
  "POST /calendar-feed": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "DELETE /calendar-feed": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "GET /calendar/:file": { uiLess: "external-client" },
  "GET /school-calendar": { consumer: "apps/app/src/shared/api/queries/school-calendar.ts" },
  "GET /school-calendar/settings": {
    consumer: "apps/app/src/features/settings/api/school-calendar.queries.ts",
  },
  "GET /school-calendar/regions": {
    consumer: "apps/app/src/features/settings/api/school-calendar.queries.ts",
  },
  "GET /school-calendar/preview": {
    consumer: "apps/app/src/features/settings/api/school-calendar.queries.ts",
  },
  "PUT /school-calendar/choice": {
    consumer: "apps/app/src/features/settings/api/school-calendar.mutations.ts",
  },
  "POST /school-calendar/periods": {
    consumer: "apps/app/src/features/settings/api/school-calendar.mutations.ts",
  },
  "DELETE /school-calendar/periods/:id": {
    consumer: "apps/app/src/features/settings/api/school-calendar.mutations.ts",
  },
  "POST /school-calendar/periods/import": {
    consumer: "apps/app/src/features/settings/api/school-calendar.mutations.ts",
  },
  "GET /assistant/preferences": {
    consumer: "apps/app/src/shared/api/queries/assistant-preferences.ts",
  },
  "PUT /assistant/preferences/language-and-region": {
    consumer: "apps/app/src/features/settings/api/settings.mutations.ts",
  },
  "PUT /assistant/preferences/extraction": {
    consumer: "apps/app/src/features/settings/api/settings.mutations.ts",
  },
  "GET /home/layout": { consumer: "apps/app/src/features/events/api/home.queries.ts" },
  "PUT /home/layout": { consumer: "apps/app/src/features/events/api/home.mutations.ts" },
  "GET /home/note": { consumer: "apps/app/src/features/events/api/home.queries.ts" },
  "PUT /home/note": { consumer: "apps/app/src/features/events/api/home.mutations.ts" },
  "GET /notifications": {
    consumer: "apps/app/src/shared/notifications/notifications.queries.ts",
  },
  "GET /notifications/unread-count": {
    consumer: "apps/app/src/shared/notifications/notifications.queries.ts",
  },
  "POST /notifications/read-all": {
    consumer: "apps/app/src/shared/notifications/notifications.mutations.ts",
  },
  "POST /notifications/read-by-ref": {
    consumer: "apps/app/src/shared/notifications/notifications.mutations.ts",
  },
  "POST /notifications/:id/read": {
    consumer: "apps/app/src/shared/notifications/notifications.mutations.ts",
  },
  "GET /children": { consumer: "apps/app/src/shared/api/queries/children.ts" },
  "GET /children/link-config": {
    consumer: "apps/app/src/shared/children/child-link.queries.ts",
  },
  "GET /children/linkable": { consumer: "apps/app/src/shared/children/child-link.queries.ts" },
  "GET /events": { consumer: "apps/app/src/features/events/api/events.queries.ts" },
  "GET /events/calendar": { consumer: "apps/app/src/features/events/api/events.queries.ts" },
  "POST /events": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "GET /events/:id": { consumer: "apps/app/src/features/events/api/events.queries.ts" },
  "GET /internal/tick": { uiLess: "external-client" },
  "POST /internal/tick": { uiLess: "external-client" },
  "GET /internal/sweep": { uiLess: "external-client" },
  "POST /internal/sweep": { uiLess: "external-client" },
  "GET /livez": { uiLess: "infra-probe" },
  "GET /readyz": { uiLess: "infra-probe" },
  "GET /startupz": { uiLess: "infra-probe" },
  "GET /stream": { uiLess: "dormant-by-design" },
  "PUT /events/:eventId/reminders": {
    consumer: "apps/app/src/features/events/api/events.mutations.ts",
  },
  "GET /events/:eventId/reminders": {
    consumer: "apps/app/src/features/events/api/events.queries.ts",
  },
  "DELETE /events/:eventId/reminders": {
    consumer: "apps/app/src/features/events/api/events.mutations.ts",
  },
  "GET /reminders/digest": { consumer: "apps/app/src/features/settings/api/settings.queries.ts" },
  "PUT /reminders/digest": {
    consumer: "apps/app/src/features/settings/api/settings.mutations.ts",
  },
  "GET /reminders/defaults": { consumer: "apps/app/src/shared/api/queries/default-reminders.ts" },
  "PUT /reminders/defaults": {
    consumer: "apps/app/src/shared/api/mutations/set-default-reminders.ts",
  },
  "GET /reminders/quiet-hours": { consumer: "apps/app/src/shared/api/queries/quiet-hours.ts" },
  "PUT /reminders/quiet-hours": {
    consumer: "apps/app/src/shared/api/mutations/set-quiet-hours.ts",
  },
  "PATCH /children/:id": { consumer: "apps/app/src/shared/children/child-link.mutations.ts" },
  "POST /push/subscriptions": {
    consumer: "apps/app/src/shared/api/mutations/save-push-subscription.ts",
  },
  "GET /push/status": { consumer: "apps/app/src/shared/api/queries/push-status.ts" },
  "GET /push/lock-screen": { consumer: "apps/app/src/shared/api/queries/lock-screen.ts" },
  "PUT /push/lock-screen": { consumer: "apps/app/src/shared/api/mutations/set-lock-screen.ts" },
  "GET /push/config": { consumer: "apps/app/src/shared/api/queries/push-config.ts" },
  "DELETE /push/subscriptions": {
    consumer: "apps/app/src/shared/api/mutations/delete-push-subscription.ts",
  },
  "PATCH /events/:id": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "POST /children": { consumer: "apps/app/src/shared/children/child-link.mutations.ts" },
  "POST /children/:id/reconnect": {
    consumer: "apps/app/src/features/children/api/children.mutations.ts",
  },
  "POST /children/linkable/:linkedAccountId/discard": {
    consumer: "apps/app/src/shared/children/child-link.mutations.ts",
  },
  "POST /events/:id/done": { consumer: "apps/app/src/shared/api/mutations/mark-event-done.ts" },
  "DELETE /events/:id/done": { consumer: "apps/app/src/shared/api/mutations/mark-event-done.ts" },
  "POST /events/:id/confirm": { consumer: "apps/app/src/features/events/api/events.mutations.ts" },
  "DELETE /events/:id/confirm": {
    consumer: "apps/app/src/features/events/api/events.mutations.ts",
  },
  "POST /events/:id/checklist": {
    consumer: "apps/app/src/features/events/api/events.mutations.ts",
  },
  "POST /me/export": { consumer: "apps/app/src/features/rgpd/api/rgpd.mutations.ts" },
  "POST /me/delete": { consumer: "apps/app/src/shared/api/mutations/request-account-deletion.ts" },
  "POST /sync": { consumer: "apps/app/src/shared/api/mutations/request-sync.ts" },
  "POST /sync/:childId": { consumer: "apps/app/src/shared/children/child-link.mutations.ts" },
};
