import { createFileRoute } from "@tanstack/react-router";
import { AiReadingCard } from "../components/ai-reading-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/ai")({
  component: AiSection,
});

function AiSection() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsSectionPage id="ai">
      <AiReadingCard userId={user.id} />
    </SettingsSectionPage>
  );
}
