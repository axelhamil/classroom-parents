import { Badge } from "@packages/ui/components/ui/badge";
import {
  DashboardPanel,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
} from "@packages/ui/components/ui/dashboard";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";

export interface BlockPanelProps {
  title: string;
  label?: string;
  count?: number;
  icon: LucideIcon;
  note?: ReactNode;
  fit?: "card" | "natural";
  line?: boolean;
  hero?: boolean;
  children?: ReactNode;
}

export function BlockPanel({
  title,
  label,
  count,
  icon: Icon,
  note,
  fit,
  line,
  hero,
  children,
}: BlockPanelProps) {
  const titleId = useId();
  const settled = Boolean(note) || Boolean(children);
  const shape = settled && (line || !children) ? "line" : "box";

  return (
    <DashboardPanel
      aria-label={label}
      aria-labelledby={label ? undefined : titleId}
      shape={shape}
      fit={fit}
      tone={hero ? "hero" : "default"}
    >
      <DashboardPanelHeader>
        <Icon aria-hidden />
        <DashboardPanelTitle id={titleId}>{title}</DashboardPanelTitle>
        {count !== undefined && count > 0 && <Badge variant="destructive">{count}</Badge>}
      </DashboardPanelHeader>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children}
    </DashboardPanel>
  );
}
