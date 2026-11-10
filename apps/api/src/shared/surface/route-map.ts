import type { RouteKey } from "./back-routes";

/**
 * Why a live route has no front consumer. Each value is a claim someone can
 * check, "dormant" is not a synonym for "unused", it is a commitment that the
 * capability ships ready for its first consumer (spec D5).
 */
export type UiLessReason =
  | "infra-probe" // health/readiness, called by the platform
  | "library-owned" // opaque surface, route table owned by a dependency
  | "dormant-by-design"; // shipped ready for a consumer that does not exist yet

export type SurfaceEntry = { consumer: string } | { uiLess: UiLessReason };

export const ROUTE_MAP: Record<RouteKey, SurfaceEntry> = {
  "ALL /api/auth/*": { uiLess: "library-owned" },
  "DELETE /children/:id": { uiLess: "dormant-by-design" },
  "DELETE /events/:id": { uiLess: "dormant-by-design" },
  "DELETE /me/delete": { consumer: "apps/app/src/shared/api/mutations/cancel-account-deletion.ts" },
  "GET /children": { uiLess: "dormant-by-design" },
  "GET /children/link-config": { uiLess: "dormant-by-design" },
  "GET /children/linkable": { uiLess: "dormant-by-design" },
  "GET /events": { uiLess: "dormant-by-design" },
  "GET /events/:id": { uiLess: "dormant-by-design" },
  "GET /livez": { uiLess: "infra-probe" },
  "GET /readyz": { uiLess: "infra-probe" },
  "GET /startupz": { uiLess: "infra-probe" },
  "GET /stream": { uiLess: "dormant-by-design" },
  "PUT /events/:eventId/alert": { uiLess: "dormant-by-design" },
  "POST /push/subscriptions": { uiLess: "dormant-by-design" },
  "GET /push/status": { uiLess: "dormant-by-design" },
  "GET /push/config": { uiLess: "dormant-by-design" },
  "GET /events/:eventId/alert": { uiLess: "dormant-by-design" },
  "DELETE /push/subscriptions": { uiLess: "dormant-by-design" },
  "DELETE /events/:eventId/alert": { uiLess: "dormant-by-design" },
  "PATCH /children/:id": { uiLess: "dormant-by-design" },
  "PATCH /events/:id": { uiLess: "dormant-by-design" },
  "POST /children": { uiLess: "dormant-by-design" },
  "POST /children/:id/reconnect": { uiLess: "dormant-by-design" },
  "POST /children/linkable/:linkedAccountId/discard": { uiLess: "dormant-by-design" },
  "POST /events/:id/confirm": { uiLess: "dormant-by-design" },
  "POST /me/delete": { consumer: "apps/app/src/shared/api/mutations/request-account-deletion.ts" },
  "POST /sync": { uiLess: "dormant-by-design" },
  "POST /sync/:childId": { uiLess: "dormant-by-design" },
};
