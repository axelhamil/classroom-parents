import { ListRow, ListRowContent } from "@packages/ui/components/ui/list-row";
import { NavLink } from "@packages/ui/components/ui/nav-link";
import { SettingsSection } from "@packages/ui/components/ui/settings-section";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";
import { DeleteAccountCard } from "./components/delete-account-card";
import { PushCard } from "./components/push-card";
import { SignOutCard } from "./components/sign-out-card";

const DATA_LINKS = [
  { to: "/settings/privacy", key: "links.privacy" },
  { to: "/legal/privacy-policy", key: "links.policy" },
  { to: "/legal/data-rights", key: "links.dataRights" },
] as const;

export const Route = createFileRoute("/_protected/_shell/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useTranslation("settings");
  const { user } = Route.useRouteContext();

  return (
    <Screen title={t("home.title")} description={t("home.description")}>
      <PushCard userId={user.id} />
      <SettingsSection title={t("links.title")} description={t("links.description")}>
        <ul className="flex flex-col">
          {DATA_LINKS.map(({ to, key }) => (
            <ListRow variant="plain" key={to}>
              <ListRowContent>
                <NavLink asChild variant="underline">
                  <Link to={to}>{t(key)}</Link>
                </NavLink>
              </ListRowContent>
            </ListRow>
          ))}
        </ul>
      </SettingsSection>
      <SignOutCard />
      <DeleteAccountCard />
    </Screen>
  );
}
