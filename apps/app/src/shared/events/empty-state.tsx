import { Panel } from "@packages/ui/components/ui/panel";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <Panel tone="muted" size="md" className="flex flex-col items-start gap-2">
      <TypographyH2 variant="section">{title}</TypographyH2>
      <TypographyMuted>{description}</TypographyMuted>
      {action}
    </Panel>
  );
}
