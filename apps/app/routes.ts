import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  layout("_guest", "router/_guest.tsx", [route("/login", "features/auth/login.route.tsx")]),

  layout("_protected", "router/_protected.tsx", [
    route("/onboarding", "features/onboarding/onboarding.route.tsx"),
    layout("_shell", "router/_shell.tsx", [
      index("features/events/events.route.tsx"),
      route("/week/print", "features/events/print-week.route.tsx"),
      route("/events/new", "features/events/event-new.route.tsx"),
      route("/events/$eventId", "features/events/event-detail.route.tsx"),
      route("/events/$eventId/edit", "features/events/event-edit.route.tsx"),
      route("/history", "features/history/history.route.tsx"),
      route("/children", "features/children/children.route.tsx"),
      route("/children/new", "features/onboarding/new-child.route.tsx"),
      route("/children/link-error", "features/children/link-error.route.tsx"),
      route("/settings", "features/settings/settings.route.tsx", [
        index("features/settings/settings-index.route.tsx"),
        route("/notifications", "features/settings/sections/notifications.route.tsx"),
        route("/region", "features/settings/sections/region.route.tsx"),
        route("/ai", "features/settings/sections/ai.route.tsx"),
        route("/appearance", "features/settings/sections/appearance.route.tsx"),
        route("/account", "features/settings/sections/account.route.tsx"),
        route("/privacy", "features/settings/sections/privacy.route.tsx"),
        route("/help", "features/settings/sections/help.route.tsx"),
      ]),
      route("/aide/ecole", "features/help/school-help.route.tsx"),
    ]),
  ]),

  route("/legal/data-rights", "features/legal/data-rights.route.tsx"),
  route("/legal/privacy-policy", "features/legal/privacy-policy.route.tsx"),
  route("/legal/terms", "features/legal/terms.route.tsx"),
  route("/legal/sub-processors", "features/legal/sub-processors.route.tsx"),
  route("/legal/accessibility", "features/legal/accessibility.route.tsx"),
  route("/legal/cookies", "features/legal/cookies.route.tsx"),
]);

export default routes;
