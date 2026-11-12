import { Button } from "@packages/ui/components/ui/button";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@packages/ui/components/ui/item";
import { SectionCard } from "@packages/ui/components/ui/section-card";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SUB_PROCESSOR_KEYS } from "../../../shared/sub-processor-labels";
import { SUB_PROCESSORS } from "../../../shared/sub-processors.config";

export function DataSourcesCard() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");

  return (
    <SectionCard
      title={t("privacy.dataSources.title")}
      description={t("privacy.dataSources.description")}
      footer={
        <Button asChild variant="outline">
          <Link to="/legal/sub-processors">{t("privacy.dataSources.viewAll")}</Link>
        </Button>
      }
    >
      <ItemGroup className="gap-2">
        {SUB_PROCESSORS.map((sp) => (
          <Item key={sp.id} role="listitem" variant="outline" size="sm">
            <ItemContent>
              <ItemTitle>{sp.name}</ItemTitle>
              <TypographyMuted>{tCommon(SUB_PROCESSOR_KEYS[sp.id].purpose)}</TypographyMuted>
              <TypographyMuted>{tCommon(SUB_PROCESSOR_KEYS[sp.id].region)}</TypographyMuted>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </SectionCard>
  );
}
