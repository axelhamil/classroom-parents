import { Badge } from "@packages/ui/components/ui/badge";
import { ListRowMeta } from "@packages/ui/components/ui/list-row";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../api/queries/events";
import { CATEGORY_BADGE_VARIANTS, CATEGORY_LABEL_KEYS, SOURCE_LABEL_KEYS } from "./event-labels";

export interface EventBadgesProps {
  event: Pick<EventItem, "category" | "source" | "status">;
}

export function EventBadges({ event }: EventBadgesProps) {
  const { t } = useTranslation("events");
  const categoryRepeatsSource = event.source === "coursework" && event.category === "homework";

  return (
    <ListRowMeta className="flex-wrap">
      {event.status === "needs_review" && <Badge variant="review">{t("review.title")}</Badge>}
      <Badge variant="secondary">{t(SOURCE_LABEL_KEYS[event.source])}</Badge>
      {!categoryRepeatsSource && (
        <Badge variant={CATEGORY_BADGE_VARIANTS[event.category]}>
          {t(CATEGORY_LABEL_KEYS[event.category])}
        </Badge>
      )}
    </ListRowMeta>
  );
}
