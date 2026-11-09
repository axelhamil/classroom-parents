import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/events/$eventId/edit")({
  component: EventEditPage,
});

function EventEditPage() {
  const { t } = useTranslation("eventEdit");

  return <Screen title={t("title")} />;
}
