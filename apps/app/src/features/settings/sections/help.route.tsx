import { createFileRoute } from "@tanstack/react-router";
import { HelpCard } from "../components/help-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/help")({
  component: HelpSection,
});

function HelpSection() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsSectionPage id="help">
      <HelpCard userId={user.id} />
    </SettingsSectionPage>
  );
}
