import { Button } from "@packages/ui/components/ui/button";
import { BackIcon } from "@packages/ui/components/ui/icons";
import { SettingsSection } from "@packages/ui/components/ui/settings";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsSectionId } from "../settings-sections";

export interface SettingsSectionPageProps {
  id: SettingsSectionId;
  children: ReactNode;
}

export function SettingsSectionPage({ id, children }: SettingsSectionPageProps) {
  const { t } = useTranslation("settings");

  return (
    <SettingsSection
      title={t(`sections.${id}`)}
      back={
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link to="/settings">
            <BackIcon aria-hidden />
            {t("sections.back")}
          </Link>
        </Button>
      }
    >
      {children}
    </SettingsSection>
  );
}
