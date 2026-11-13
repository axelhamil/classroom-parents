import { Button } from "@packages/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { ActionAlert } from "../../../shared/components/action-alert";
import { BLOCKED_DESCRIPTION_KEYS, BLOCKED_TITLE_KEYS } from "../event-labels";

export interface BlockedChildrenNoticeProps {
  childrenList: readonly ChildDto[];
}

export function BlockedChildrenNotice({ childrenList }: BlockedChildrenNoticeProps) {
  const { t } = useTranslation("events");

  return childrenList.map((child) =>
    child.status === "needs_reconnect" || child.status === "blocked_by_school" ? (
      <ActionAlert
        key={child.id}
        tone="warning"
        title={t(BLOCKED_TITLE_KEYS[child.status], { child: child.label })}
        description={t(BLOCKED_DESCRIPTION_KEYS[child.status])}
        action={
          <Button asChild size="sm" variant="outline">
            <Link to="/children">{t("blocked.action")}</Link>
          </Button>
        }
      />
    ) : null,
  );
}
