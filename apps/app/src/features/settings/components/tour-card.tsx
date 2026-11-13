import { Button } from "@packages/ui/components/ui/button";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { useNavigate } from "@tanstack/react-router";
import { MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { restartTours } from "../../../shared/tour/tours";

export interface TourCardProps {
  userId: string;
}

export function TourCard({ userId }: TourCardProps) {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();

  const restart = () =>
    void navigate({ to: "/", viewTransition: true }).then(() => restartTours(userId));

  return (
    <SectionCard
      title={t("tour.title")}
      description={t("tour.description")}
      data-tour="settings-tour"
      footer={
        <Button type="button" variant="outline" onClick={restart}>
          <MapIcon aria-hidden />
          {t("tour.action")}
        </Button>
      }
    />
  );
}
