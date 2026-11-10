import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { toastError } from "@packages/web-kit/api/errors/toast";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LINK_ERROR_PATH, startChildLinkMutationOptions } from "../api/children.mutations";

export interface ReconnectBannerProps {
  childId: string;
  message: string;
}

export function ReconnectBanner({ childId, message }: ReconnectBannerProps) {
  const { t } = useTranslation("children");
  const start = useMutation({
    ...startChildLinkMutationOptions,
    onError: (error) => toastError(error, t("reconnect.failed")),
  });

  return (
    <Alert>
      <RefreshCw aria-hidden />
      <AlertDescription className="gap-3">
        {message}
        <Button
          disabled={start.isPending}
          onClick={() =>
            start.mutate({
              callbackPath: `/children?reconnect=${childId}`,
              errorPath: LINK_ERROR_PATH,
            })
          }
        >
          {start.isPending ? t("reconnect.pending") : t("reconnect.action")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
