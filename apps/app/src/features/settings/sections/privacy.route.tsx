import { createFileRoute } from "@tanstack/react-router";
import { DataSourcesCard } from "../components/data-sources-card";
import { DeleteAccountCard } from "../components/delete-account-card";
import { DataReadCard, YourDataCard } from "../components/privacy-cards";
import { SettingsSectionPage } from "../components/settings-section";
import { settingsSearchSchema } from "../settings.schema";

export const Route = createFileRoute("/_protected/_shell/settings/privacy")({
  validateSearch: settingsSearchSchema,
  component: PrivacySection,
});

function PrivacySection() {
  const { user } = Route.useRouteContext();
  const { reauth, error } = Route.useSearch();

  return (
    <SettingsSectionPage id="privacy">
      <DataReadCard />
      <YourDataCard />
      <DataSourcesCard />
      <DeleteAccountCard userId={user.id} reauthError={reauth ? (error ?? reauth) : undefined} />
    </SettingsSectionPage>
  );
}
