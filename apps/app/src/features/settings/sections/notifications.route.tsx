import { createFileRoute } from "@tanstack/react-router";
import { DefaultRemindersCard } from "../components/default-reminders-card";
import { DigestCard } from "../components/digest-card";
import { PushCard } from "../components/push-card";
import { QuietHoursCard } from "../components/quiet-hours-card";
import { SettingsSectionPage } from "../components/settings-section";

export const Route = createFileRoute("/_protected/_shell/settings/notifications")({
  component: NotificationsSection,
});

function NotificationsSection() {
  const { user } = Route.useRouteContext();

  return (
    <SettingsSectionPage id="notifications">
      <PushCard userId={user.id} />
      <DefaultRemindersCard userId={user.id} />
      <QuietHoursCard userId={user.id} />
      <DigestCard userId={user.id} />
    </SettingsSectionPage>
  );
}
