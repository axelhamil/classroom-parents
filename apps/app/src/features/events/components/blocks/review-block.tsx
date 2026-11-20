import { useQuery } from "@tanstack/react-query";
import { SearchCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { reviewView } from "../../../../shared/agenda/views";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { lateBacklogQueryOptions, reviewEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { ReviewLine } from "../review-line";
import { BlockPanel } from "./block-panel";

function ReviewBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const coming = useQuery(reviewEventsQueryOptions({ category: null, childId }));
  const backlog = useQuery(lateBacklogQueryOptions(childId));
  const { upcoming, past } = reviewView([...(coming.data ?? []), ...(backlog.data ?? [])], clock);
  const empty = upcoming.length === 0 && past.length === 0;

  return (
    <BlockPanel
      title={title}
      icon={SearchCheckIcon}
      note={
        coming.isSuccess &&
        (empty
          ? t("blocks.review.empty")
          : past.length > 0 && t("blocks.review.past", { count: past.length }))
      }
    >
      {upcoming.length > 0 && (
        <ReviewLine
          stretched
          events={upcoming}
          childLabel={(id) => childLabelOf(family, id)}
          childColor={(id) => childHue(family, id)}
        />
      )}
    </BlockPanel>
  );
}

export const reviewBlock: HomeBlockDefinition = {
  id: "review",
  titleKey: "blocks.review.title",
  descriptionKey: "blocks.review.description",
  icon: SearchCheckIcon,
  Component: ReviewBlock,
};
