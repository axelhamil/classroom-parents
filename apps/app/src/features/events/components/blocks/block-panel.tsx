import {
  DashboardPanel,
  DashboardPanelHeader,
  DashboardPanelNote,
  DashboardPanelTitle,
} from "@packages/ui/components/ui/dashboard";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { useCompactTile } from "../../../../shared/dashboard/compact-tile";

export interface BlockPanelProps {
  title: string;
  icon: LucideIcon;
  note?: ReactNode;
  fit?: "card" | "natural";
  line?: boolean;
  children?: ReactNode;
}

export function BlockPanel({ title, icon: Icon, note, fit, line, children }: BlockPanelProps) {
  const titleId = useId();
  const settled = Boolean(note) || Boolean(children);
  const shape = settled && (line || !children) ? "line" : "box";
  useCompactTile(shape === "line");

  return (
    <DashboardPanel aria-labelledby={titleId} shape={shape} fit={fit}>
      <DashboardPanelHeader>
        <Icon aria-hidden />
        <DashboardPanelTitle id={titleId}>{title}</DashboardPanelTitle>
      </DashboardPanelHeader>
      {note && <DashboardPanelNote>{note}</DashboardPanelNote>}
      {children}
    </DashboardPanel>
  );
}
