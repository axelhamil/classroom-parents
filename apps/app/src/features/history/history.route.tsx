import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const { t } = useTranslation("history");

  return (
    <Screen title={t("title")}>
      <TypographyMuted>{t("empty")}</TypographyMuted>
    </Screen>
  );
}
