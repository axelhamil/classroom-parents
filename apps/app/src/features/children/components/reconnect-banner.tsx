import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStartChildLink } from "../hooks/use-start-child-link";

export interface ReconnectBannerProps {
  childId: string;
  message: string;
}

export function ReconnectBanner({ childId, message }: ReconnectBannerProps) {
  const { t } = useTranslation("children");
  const start = useStartChildLink();

  return (
    <Alert>
      <RefreshCw aria-hidden />
      <AlertDescription className="gap-3">
        {message}
        <Button
          disabled={start.isPending}
          onClick={() => start.mutate({ reconnectChildId: childId })}
        >
          {start.isPending ? t("reconnect.pending") : t("reconnect.action")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
