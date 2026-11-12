import { Item, ItemContent, ItemGroup, ItemMedia } from "@packages/ui/components/ui/item";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyP } from "@packages/ui/components/ui/typography";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, ClipboardList, Megaphone } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { env } from "../../shared/env";
import { Screen } from "../../shared/layout/screen";
import { DataSourcesCard } from "./components/data-sources-card";

export const Route = createFileRoute("/_protected/_shell/settings/privacy")({
  component: PrivacyPage,
});

const READS = [
  { key: "privacy.reads.courses", icon: BookOpen },
  { key: "privacy.reads.announcements", icon: Megaphone },
  { key: "privacy.reads.coursework", icon: ClipboardList },
] as const;

function PrivacyPage() {
  const { t } = useTranslation("settings");

  return (
    <Screen title={t("privacy.pageTitle")} description={t("privacy.pageDescription")}>
      <SectionCard title={t("privacy.reads.title")} description={t("privacy.reads.description")}>
        <ItemGroup className="gap-2">
          {READS.map(({ key, icon: Icon }) => (
            <Item key={key} role="listitem" variant="muted" size="sm">
              <ItemMedia variant="icon">
                <Icon aria-hidden />
              </ItemMedia>
              <ItemContent>
                <TypographyP>{t(key)}</TypographyP>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </SectionCard>
      <SectionCard title={t("privacy.limitedUse.title")}>
        <TypographyP>{t("privacy.limitedUse.body")}</TypographyP>
      </SectionCard>
      <SectionCard title={t("privacy.ai.title")}>
        <TypographyP>{t("privacy.ai.body")}</TypographyP>
      </SectionCard>
      <DataSourcesCard />
      <SectionCard title={t("privacy.rights.title")} description={t("privacy.rights.description")}>
        <TypographyP>
          <Trans
            t={t}
            i18nKey="privacy.rights.contact"
            values={{ email: env.VITE_CONTACT_EMAIL }}
            components={{ mail: <TextLink href={`mailto:${env.VITE_CONTACT_EMAIL}`} /> }}
          />
        </TypographyP>
      </SectionCard>
    </Screen>
  );
}
