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
  "DELETE /me/delete": { consumer: "apps/app/src/shared/api/mutations/cancel-account-deletion.ts" },
  "GET /livez": { uiLess: "infra-probe" },
  "GET /readyz": { uiLess: "infra-probe" },
  "GET /startupz": { uiLess: "infra-probe" },
  "POST /me/delete": { consumer: "apps/app/src/shared/api/mutations/request-account-deletion.ts" },
};
