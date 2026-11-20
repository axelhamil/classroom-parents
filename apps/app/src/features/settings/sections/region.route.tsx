import { createFileRoute } from "@tanstack/react-router";
import { LanguageAndRegionCard } from "../components/language-and-region-card";
import { SchoolHolidaysCard } from "../components/school-holidays-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/region")({
  component: RegionSection,
});

function RegionSection() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsSectionPage id="region">
      <LanguageAndRegionCard userId={user.id} />
      <SchoolHolidaysCard userId={user.id} />
    </SettingsSectionPage>
  );
}
