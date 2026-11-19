import { useQuery } from "@tanstack/react-query";
import { SearchCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { reviewEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { ReviewLine } from "../review-line";
import { BlockPanel } from "./block-panel";

function ReviewBlock({ family, childId, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const review = useQuery(reviewEventsQueryOptions({ category: null, childId }));
  const toReview = review.data ?? [];

  return (
    <BlockPanel
      title={title}
      icon={SearchCheckIcon}
      line
      note={review.isSuccess && toReview.length === 0 && t("blocks.review.empty")}
    >
      {toReview.length > 0 && (
        <ReviewLine
          stretched
          events={toReview}
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
  sizes: { w: [3, 4, 6, 8, 12], h: [1] },
  defaultSize: { w: 4, h: 1 },
  Component: ReviewBlock,
};
