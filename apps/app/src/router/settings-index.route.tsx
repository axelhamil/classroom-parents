import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/privacy" });
  },
});
