import {
  DashboardPanel,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
} from "@packages/ui/components/ui/dashboard";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

export interface BlockPanelProps {
  title: string;
  icon: LucideIcon;
  note?: ReactNode;
  fit?: "capped" | "natural";
  scroll?: boolean;
  children?: ReactNode;
}

export function BlockPanel({
  title,
  icon: Icon,
  note,
  fit,
  scroll = true,
  children,
}: BlockPanelProps) {
  const { t } = useTranslation("home");
  const titleId = useId();

  return (
    <DashboardPanel aria-labelledby={titleId} fit={fit}>
      <DashboardPanelHeader>
        <Icon aria-hidden />
        <DashboardPanelTitle id={titleId}>{title}</DashboardPanelTitle>
      </DashboardPanelHeader>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children && !scroll && children}
      {children && scroll && (
        <ScrollRegion variant="panel" label={t("blocks.scroll", { block: title })}>
          {children}
        </ScrollRegion>
      )}
    </DashboardPanel>
  );
}
