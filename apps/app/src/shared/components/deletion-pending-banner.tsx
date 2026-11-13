import { Button } from "@packages/ui/components/ui/button";
import { pageContainerVariants } from "@packages/ui/components/ui/page-container";
import { cn } from "@packages/ui/libs/utils.js";
import { useFormatDateTime } from "@packages/web-kit/i18n/use-format-date";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { sessionQueryOptions } from "../api/queries/session";
import { useCancelDeletion } from "../auth/use-cancel-deletion";
import { ActionAlert } from "./action-alert";

export function DeletionPendingBanner() {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const { data: session } = useQuery(sessionQueryOptions);
  const cancel = useCancelDeletion();
  const formatDateTime = useFormatDateTime();
  const until = session?.user.pendingDeletionUntil;

  if (!until) return null;

  return (
    <div className={cn(pageContainerVariants(), "pt-4")}>
      <ActionAlert
        tone="destructive"
        title={tCommon("deletionBanner.title")}
        description={t("deletion.scheduledDescription", {
          date: formatDateTime(new Date(until)),
        })}
        action={
          <Button
            variant="outline"
            size="sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? t("deletion.cancelling") : t("deletion.cancel")}
          </Button>
        }
      />
    </div>
  );
}
