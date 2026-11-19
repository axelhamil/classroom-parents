import { PageSection } from "@packages/ui/components/ui/page-section";
import { SectionNav, SectionNavLink } from "@packages/ui/components/ui/section-nav";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "../settings-sections";

export interface SettingsSectionProps {
  id: SettingsSectionId;
  children: ReactNode;
}

export function SettingsSection({ id, children }: SettingsSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <PageSection id={id} title={t(`sections.${id}`)}>
      {children}
    </PageSection>
  );
}

export function SettingsSectionNav() {
  const { t } = useTranslation("settings");

  return (
    <SectionNav aria-label={t("sections.label")}>
      {SETTINGS_SECTIONS.map((id) => (
        <SectionNavLink key={id} href={`#${id}`}>
          {t(`sections.${id}`)}
        </SectionNavLink>
      ))}
    </SectionNav>
  );
}
