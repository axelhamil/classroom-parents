import { CardColumns } from "@packages/ui/components/ui/card-columns";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { ScreenTour } from "../../shared/tour/screen-tour";
import { AccountCard } from "./components/account-card";
import { AiReadingCard } from "./components/ai-reading-card";
import { AppearanceCard } from "./components/appearance-card";
import { DefaultRemindersCard } from "./components/default-reminders-card";
import { DeleteAccountCard } from "./components/delete-account-card";
import { DevicesCard } from "./components/devices-card";
import { DigestCard } from "./components/digest-card";
import { LanguageAndRegionCard } from "./components/language-and-region-card";
import { PrivacyLinksCard } from "./components/privacy-links-card";
import { PushCard } from "./components/push-card";
import { QuietHoursCard } from "./components/quiet-hours-card";
import { SchoolHolidaysCard } from "./components/school-holidays-card";
import { SettingsSection, SettingsSectionNav } from "./components/settings-section";
import { TourCard } from "./components/tour-card";
import { settingsSearchSchema } from "./settings.schema";

export const Route = createFileRoute("/_protected/_shell/settings")({
  validateSearch: settingsSearchSchema,
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation("settings");
  const { user, sessionToken } = Route.useRouteContext();
  const { reauth, error } = Route.useSearch();

  return (
    <Screen title={t("home.title")} description={t("home.description")} width="full">
      <SettingsSectionNav />
      <CardColumns>
        <SettingsSection id="notifications">
          <PushCard userId={user.id} />
          <DefaultRemindersCard userId={user.id} />
          <QuietHoursCard userId={user.id} />
          <DigestCard userId={user.id} />
        </SettingsSection>
        <SettingsSection id="region">
          <LanguageAndRegionCard userId={user.id} />
          <SchoolHolidaysCard userId={user.id} />
          <AiReadingCard userId={user.id} />
        </SettingsSection>
        <SettingsSection id="account">
          <AccountCard user={user} />
          <DevicesCard userId={user.id} currentSessionToken={sessionToken} />
        </SettingsSection>
        <SettingsSection id="appearance">
          <AppearanceCard />
          <TourCard userId={user.id} />
        </SettingsSection>
        <SettingsSection id="privacy">
          <PrivacyLinksCard />
          <DeleteAccountCard
            userId={user.id}
            reauthError={reauth ? (error ?? reauth) : undefined}
          />
        </SettingsSection>
      </CardColumns>
      <ScreenTour screen="settings" userId={user.id} />
    </Screen>
  );
}
