import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/children/link-error")({
  component: LinkErrorPage,
});

function LinkErrorPage() {
  const { t } = useTranslation("children");

  return <Screen title={t("linkError.title")} description={t("linkError.description")} />;
}
