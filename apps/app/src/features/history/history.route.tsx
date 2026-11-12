import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/_shell/history")({
  beforeLoad: () => {
    throw redirect({ to: "/", search: { tab: "history" }, replace: true });
  },
});
