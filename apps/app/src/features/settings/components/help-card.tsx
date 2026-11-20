import { Button } from "@packages/ui/components/ui/button";
import { EmailIcon, SchoolIcon, TourIcon } from "@packages/ui/components/ui/icons";
import { SettingsGroup, SettingsRow } from "@packages/ui/components/ui/settings";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { env } from "../../../shared/env";
import { restartTours } from "../../../shared/tour/tours";
import { SETTINGS_ANCHORS } from "../settings-search-index";

export interface HelpCardProps {
  userId: string;
}

export function HelpCard({ userId }: HelpCardProps) {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();

  const restartTour = () =>
    void navigate({ to: "/", viewTransition: true }).then(() => restartTours(userId));

  return (
    <SettingsGroup id={SETTINGS_ANCHORS.tour} title={t("help.title")}>
      <SettingsRow
        label={t("tour.title")}
        description={t("tour.description")}
        control={
          <Button type="button" variant="outline" size="sm" onClick={restartTour}>
            <TourIcon aria-hidden />
            {t("tour.action")}
          </Button>
        }
      />
      <SettingsRow
        label={t("schoolHelp.title")}
        description={t("schoolHelp.description")}
        control={
          <Button asChild variant="outline" size="sm">
            <Link to="/aide/ecole">
              <SchoolIcon aria-hidden />
              {t("schoolHelp.action")}
            </Link>
          </Button>
        }
      />
      <SettingsRow
        label={t("help.contact")}
        description={t("help.contactDescription")}
        control={
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${env.VITE_CONTACT_EMAIL}`}>
              <EmailIcon aria-hidden />
              {env.VITE_CONTACT_EMAIL}
            </a>
          </Button>
        }
      />
    </SettingsGroup>
  );
}
