import { index, layout, rootRoute, route } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("router/__root.tsx", [
  index("router/index.route.tsx"),

  layout("_guest", "router/_guest.tsx", [
    route("/sign-in", "features/auth/sign-in.route.tsx"),
    route("/sign-up", "features/auth/sign-up.route.tsx"),
  ]),

  layout("_protected", "router/_protected.tsx", [
    layout("_shell", "router/_shell.tsx", [
      route("/dashboard", "features/dashboard/dashboard.route.tsx"),

      route("/settings", "router/settings.tsx", [
        index("router/settings-index.route.tsx"),
        route("/privacy", "features/privacy/privacy.route.tsx"),
      ]),
    ]),
  ]),

  route("/legal/data-rights", "features/legal/data-rights.route.tsx"),
  route("/legal/privacy-policy", "features/legal/privacy-policy.route.tsx"),
  route("/legal/terms", "features/legal/terms.route.tsx"),
  route("/legal/sub-processors", "features/legal/sub-processors.route.tsx"),
  route("/legal/accessibility", "features/legal/accessibility.route.tsx"),
  route("/legal/cookies", "features/legal/cookies.route.tsx"),
  route("/verify-email", "features/auth/verify-email.route.tsx"),
]);

export default routes;
