import { Alert, AlertAction, AlertDescription, AlertTitle } from "@packages/ui/components/ui/alert";
import { InfoIcon, OctagonAlertIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ActionAlertTone = "info" | "warning" | "destructive";

const TONE_ICONS = {
  info: InfoIcon,
  warning: TriangleAlertIcon,
  destructive: OctagonAlertIcon,
} as const satisfies Record<ActionAlertTone, unknown>;

export interface ActionAlertProps {
  tone: ActionAlertTone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function ActionAlert({ tone, title, description, action }: ActionAlertProps) {
  const Icon = TONE_ICONS[tone];

  return (
    <Alert variant={tone}>
      <Icon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      {description && <AlertDescription>{description}</AlertDescription>}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  );
}
