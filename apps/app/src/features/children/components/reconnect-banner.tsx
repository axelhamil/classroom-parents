import { Button } from "@packages/ui/components/ui/button";
import { useTranslation } from "react-i18next";
import { ActionAlert } from "../../../shared/components/action-alert";
import { useStartChildLink } from "../hooks/use-start-child-link";

export interface ReconnectBannerProps {
  childId: string;
  title: string;
  message: string;
}

export function ReconnectBanner({ childId, title, message }: ReconnectBannerProps) {
  const { t } = useTranslation("children");
  const start = useStartChildLink();

  return (
    <ActionAlert
      tone="warning"
      title={title}
      description={message}
      action={
        <Button
          size="sm"
          disabled={start.isPending}
          onClick={() => start.mutate({ reconnectChildId: childId })}
        >
          {start.isPending ? t("reconnect.pending") : t("reconnect.action")}
        </Button>
      }
    />
  );
}
