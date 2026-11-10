import { Alert, AlertDescription } from "@packages/ui/components/ui/alert";
import { Button } from "@packages/ui/components/ui/button";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { BLOCKED_LABEL_KEYS } from "../event-labels";

export interface BlockedChildrenNoticeProps {
  childrenList: readonly ChildDto[];
}

export function BlockedChildrenNotice({ childrenList }: BlockedChildrenNoticeProps) {
  const { t } = useTranslation("events");

  return childrenList.map((child) =>
    child.status === "needs_reconnect" || child.status === "blocked_by_school" ? (
      <Alert key={child.id}>
        <TriangleAlert aria-hidden />
        <AlertDescription className="gap-2">
          {t(BLOCKED_LABEL_KEYS[child.status], { child: child.label })}
          <Button asChild size="sm" variant="outline">
            <Link to="/children">{t("blocked.action")}</Link>
          </Button>
        </AlertDescription>
      </Alert>
    ) : null,
  );
}
