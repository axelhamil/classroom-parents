import { Badge } from "@packages/ui/components/ui/badge";
import { ListRow, ListRowMedia } from "@packages/ui/components/ui/list-row";
import { Panel } from "@packages/ui/components/ui/panel";
import { TypographyH3, TypographyMuted, TypographyP } from "@packages/ui/components/ui/typography";
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
    <Panel tone="muted" size="md" className="flex flex-col gap-3">
      <TypographyH3>{t("install.title")}</TypographyH3>
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
    </Panel>
  );
}
