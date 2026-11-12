import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  layout("_guest", "router/_guest.tsx", [route("/login", "features/auth/login.route.tsx")]),

  layout("_protected", "router/_protected.tsx", [
    layout("_shell", "router/_shell.tsx", [
      index("features/events/events.route.tsx"),
      route("/events/$eventId", "features/events/event-detail.route.tsx"),
      route("/events/$eventId/edit", "features/events/event-edit.route.tsx"),
      route("/history", "features/history/history.route.tsx"),
      route("/children", "features/children/children.route.tsx"),
      route("/children/new", "features/children/new-child.route.tsx"),
      route("/children/link-error", "features/children/link-error.route.tsx"),
      route("/settings", "features/settings/settings.route.tsx"),
      route("/settings/privacy", "features/privacy/privacy.route.tsx"),
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
