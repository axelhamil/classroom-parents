import { createFileRoute } from "@tanstack/react-router";
import { PaletteCard, ThemeCard } from "../components/appearance-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/appearance")({
  component: AppearanceSection,
});

function AppearanceSection() {
  return (
    <SettingsSectionPage id="appearance">
      <ThemeCard />
      <PaletteCard />
    </SettingsSectionPage>
  );
}
