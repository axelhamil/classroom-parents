import { Badge } from "@packages/ui/components/ui/badge";
import { Item, ItemContent, ItemTitle } from "@packages/ui/components/ui/item";
import { ListRow, ListRowMedia } from "@packages/ui/components/ui/list-row";
import { TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
import { type LucideIcon, Share, Smartphone, SquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface InstallStep {
  key: "install.steps.share" | "install.steps.addToHome" | "install.steps.reopen";
  icon: LucideIcon;
}

const STEPS: readonly InstallStep[] = [
  { key: "install.steps.share", icon: Share },
  { key: "install.steps.addToHome", icon: SquarePlus },
  { key: "install.steps.reopen", icon: Smartphone },
];

export function InstallGuide() {
  const { t } = useTranslation("settings");

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle role="heading" aria-level={3}>
          {t("install.title")}
        </ItemTitle>
        <TypographyMuted>{t("install.description")}</TypographyMuted>
        <ol className="flex flex-col">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <ListRow variant="plain" key={key} className="justify-start">
              <ListRowMedia>
                <Badge variant="secondary">{index + 1}</Badge>
                <Icon aria-hidden />
              </ListRowMedia>
              <TypographyP>{t(key)}</TypographyP>
            </ListRow>
          ))}
        </ol>
      </ItemContent>
    </Item>
  );
}
