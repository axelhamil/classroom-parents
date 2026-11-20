import { Button } from "@packages/ui/components/ui/button";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { Link } from "@tanstack/react-router";
import { School } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SchoolHelpCard() {
  const { t } = useTranslation("settings");

  return (
    <SectionCard
      title={t("schoolHelp.title")}
      description={t("schoolHelp.description")}
      footer={
        <Button asChild variant="outline">
          <Link to="/aide/ecole">
            <School aria-hidden />
            {t("schoolHelp.action")}
          </Link>
        </Button>
      }
    />
  );
}
