import { TypographyH1 } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RgpdDeletionCard } from "../rgpd/components/rgpd-deletion-card";
import { DataSourcesCard } from "./components/data-sources-card";

export const Route = createFileRoute("/_protected/_shell/settings/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user } = Route.useRouteContext();
  const { t } = useTranslation("settings");

  return (
    <main className="flex flex-col gap-8">
      <TypographyH1 className="sr-only">{t("privacy.pageTitle")}</TypographyH1>
      <DataSourcesCard />
      <RgpdDeletionCard pendingDeletionUntil={user.pendingDeletionUntil} />
    </main>
  );
}
