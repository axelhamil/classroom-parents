import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Screen } from "../../shared/layout/screen";

export const Route = createFileRoute("/_protected/_shell/events/$eventId")({
  component: EventDetailPage,
});

function EventDetailPage() {
  const { t } = useTranslation("events");

  return <Screen title={t("detail.title")} />;
}
