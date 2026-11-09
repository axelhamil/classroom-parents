import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/children")({
  component: ChildrenPage,
});

function ChildrenPage() {
  const { t } = useTranslation("children");

  return <Screen title={t("list.title")} description={t("list.description")} />;
}
