import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/children/new")({
  component: NewChildPage,
});

function NewChildPage() {
  const { t } = useTranslation("children");

  return <Screen title={t("new.title")} description={t("new.description")} />;
}
