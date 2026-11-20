import { SettingsLayout } from "@packages/ui/components/ui/settings";
import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { TABLET_QUERY, useMediaQuery } from "../../shared/layout/use-media-query";
import { ScreenTour } from "../../shared/tour/screen-tour";
import { SettingsSidebar } from "./components/settings-sidebar";
import { sectionOfPath } from "./settings-sections";

export const Route = createFileRoute("/_protected/_shell/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation("settings");
  const { user } = Route.useRouteContext();
  const pathname = useLocation({ select: (location) => location.pathname });
  const twoPanes = useMediaQuery(TABLET_QUERY);
  const sectionOpen = sectionOfPath(pathname) !== undefined;

  return (
    <Screen title={t("home.title")} width="full" phoneHeader={sectionOpen ? "hidden" : "shown"}>
      <SettingsLayout sidebar={<SettingsSidebar />} sectionOpen={sectionOpen}>
        <Outlet />
      </SettingsLayout>
      {twoPanes || !sectionOpen ? <ScreenTour screen="settings" userId={user.id} /> : null}
    </Screen>
  );
}
