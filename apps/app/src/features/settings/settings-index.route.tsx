import { createFileRoute, Navigate } from "@tanstack/react-router";
import { TABLET_QUERY, useMediaQuery } from "../../shared/layout/use-media-query";

export const Route = createFileRoute("/_protected/_shell/settings/")({
  component: SettingsIndex,
});

function SettingsIndex() {
  const twoPanes = useMediaQuery(TABLET_QUERY);
  if (!twoPanes) return null;

  return <Navigate to="/settings/notifications" replace />;
}
