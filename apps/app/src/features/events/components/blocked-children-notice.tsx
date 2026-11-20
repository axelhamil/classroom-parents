import { Button } from "@packages/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { useStartChildLink } from "../../../shared/children/use-start-child-link";
import { ActionAlert } from "../../../shared/components/action-alert";
import { BLOCKED_DESCRIPTION_KEYS, BLOCKED_TITLE_KEYS } from "../event-labels";

type BlockedStatus = keyof typeof BLOCKED_TITLE_KEYS;

function isBlocked(status: ChildDto["status"]): status is BlockedStatus {
  return status in BLOCKED_TITLE_KEYS;
}

export interface BlockedChildrenNoticeProps {
  childrenList: readonly ChildDto[];
}

export function BlockedChildrenNotice({ childrenList }: BlockedChildrenNoticeProps) {
  const { t } = useTranslation("events");

  return childrenList.map((child) => {
    const status = child.status;
    if (!isBlocked(status)) return null;

    return (
      <ActionAlert
        key={child.id}
        tone="warning"
        density="compact"
        title={t(BLOCKED_TITLE_KEYS[status], { child: child.label })}
        description={t(BLOCKED_DESCRIPTION_KEYS[status])}
        action={
          status === "needs_reconnect" ? (
            <ReconnectAction childId={child.id} />
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/aide/ecole">{t("blocked.schoolAction")}</Link>
            </Button>
          )
        }
      />
    );
  });
}

interface ReconnectActionProps {
  childId: string;
}

function ReconnectAction({ childId }: ReconnectActionProps) {
  const { t } = useTranslation("children");
  const start = useStartChildLink();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={start.isPending}
      onClick={() => start.mutate({ reconnectChildId: childId })}
    >
      {start.isPending ? t("reconnect.pending") : t("reconnect.action")}
    </Button>
  );
}
