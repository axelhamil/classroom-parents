import { createFileRoute } from "@tanstack/react-router";
import { AccountCard } from "../components/account-card";
import { DevicesCard } from "../components/devices-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/account")({
  component: AccountSection,
});

function AccountSection() {
  const { user, sessionToken } = Route.useRouteContext();

  return (
    <SettingsSectionPage id="account">
      <AccountCard user={user} />
      <DevicesCard userId={user.id} currentSessionToken={sessionToken} />
    </SettingsSectionPage>
  );
}
