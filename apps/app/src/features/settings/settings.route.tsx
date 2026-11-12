import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { ScreenTour } from "../../shared/tour/screen-tour";
import { AccountCard } from "./components/account-card";
import { AppearanceCard } from "./components/appearance-card";
import { DefaultRemindersCard } from "./components/default-reminders-card";
import { DeleteAccountCard } from "./components/delete-account-card";
import { DevicesCard } from "./components/devices-card";
import { PrivacyLinksCard } from "./components/privacy-links-card";
import { PushCard } from "./components/push-card";
import { QuietHoursCard } from "./components/quiet-hours-card";
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
    <Screen title={t("home.title")} description={t("home.description")} width="app">
      <div className="grid items-start gap-6 @4xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <PushCard userId={user.id} />
          <DefaultRemindersCard userId={user.id} />
          <QuietHoursCard userId={user.id} />
          <AppearanceCard />
          <TourCard userId={user.id} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <DevicesCard userId={user.id} currentSessionToken={sessionToken} />
          <PrivacyLinksCard />
          <AccountCard user={user} />
          <DeleteAccountCard reauthError={reauth ? (error ?? reauth) : undefined} />
        </div>
      </div>
      <ScreenTour screen="settings" userId={user.id} />
    </Screen>
  );
}
