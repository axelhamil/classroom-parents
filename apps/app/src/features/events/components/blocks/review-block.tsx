import { DashboardPanelFigure } from "@packages/ui/components/ui/dashboard";
import { AllDoneIcon, ConfirmDateIcon } from "@packages/ui/components/ui/icons";
import { RollingCount } from "@packages/ui/components/ui/rolling-count";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { reviewView } from "../../../../shared/agenda/views";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { useTileFrame } from "../../../../shared/dashboard/tile-frame";
import { childHue, childLabelOf, deadlineSurface } from "../../../../shared/format/child-hue";
import { deadlineLabel, inSentence } from "../../../../shared/format/deadline-label";
import { lateBacklogQueryOptions, reviewEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useReviewConfirmation } from "../../hooks/use-review-confirmation";
import { mainReviewSentenceKey } from "../../review-labels";
import { ReviewLine } from "../review-line";
import { BlockEmpty } from "./block-empty";
import { BlockPanel } from "./block-panel";
import { ReviewRows } from "./review-rows";

function ReviewBlock({ family, childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const coming = useQuery(reviewEventsQueryOptions({ category: null, childId }));
  const backlog = useQuery(lateBacklogQueryOptions(childId));
  const confirm = useReviewConfirmation();
  const { upcoming, past } = reviewView([...(coming.data ?? []), ...(backlog.data ?? [])], clock);
  const [handOver, setHandOver] = useState(false);
  const takeFocus = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    node.focus();
    setHandOver(false);
  }, []);

  const { size } = useTileFrame();
  const glance = size === "s";
  const listed = size === "l" || size === "xl";
  const pastNote =
    past.length > 0
      ? t("blocks.review.past", { count: past.length })
      : t("blocks.review.emptyHint");

  return (
    <BlockPanel title={title} icon={ConfirmDateIcon} fits={!listed}>
      {coming.isSuccess && upcoming.length === 0 && (
        <BlockEmpty
          ref={handOver ? takeFocus : undefined}
          icon={AllDoneIcon}
          title={t("blocks.review.empty")}
          hint={pastNote}
        />
      )}
      {upcoming.length > 0 && (
        <>
          <ReviewFigure events={upcoming} family={family} />
          <ReviewReason events={upcoming} />
          {glance ? (
            <ReviewNearest events={upcoming} today={clock.today} />
          ) : (
            <ReviewRows
              events={upcoming}
              family={family}
              today={clock.today}
              confirm={confirm}
              onLastLeft={() => setHandOver(true)}
              compact={!listed}
            />
          )}
          {listed && past.length > 0 && (
            <TypographyMuted className="line-clamp-2">{pastNote}</TypographyMuted>
          )}
        </>
      )}
    </BlockPanel>
  );
}

interface ReviewFigureProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
}

function ReviewFigure({ events, family }: ReviewFigureProps) {
  const { t } = useTranslation("home");
  const count = events.length;

  return (
    <DashboardPanelFigure>
      <RollingCount value={count} />
      <span>{t("blocks.review.count", { count })}</span>
      <ReviewLine
        stretched
        events={events}
        label={t("blocks.review.openAll", { count })}
        childLabel={(id) => childLabelOf(family, id)}
        childColor={(id) => childHue(family, id)}
        surface={deadlineSurface(family)}
      />
    </DashboardPanelFigure>
  );
}

interface ReviewReasonProps {
  events: readonly EventItem[];
}

function ReviewReason({ events }: ReviewReasonProps) {
  const { t } = useTranslation("events");

  return (
    <TypographyMuted className="line-clamp-1">{t(mainReviewSentenceKey(events))}</TypographyMuted>
  );
}

interface ReviewNearestProps {
  events: readonly EventItem[];
  today: string;
}

function ReviewNearest({ events, today }: ReviewNearestProps) {
  const { t } = useTranslation("home");
  const [nearest] = events;
  if (!nearest) return null;

  const when = inSentence(deadlineLabel(nearest.deadlineDate, nearest.deadlineTime, today));

  return (
    <TypographyMuted className="line-clamp-1">
      {t("blocks.review.nearest", { title: nearest.title, when })}
    </TypographyMuted>
  );
}

export const reviewBlock: HomeBlockDefinition = {
  id: "review",
  titleKey: "blocks.review.title",
  descriptionKey: "blocks.review.description",
  icon: ConfirmDateIcon,
  Component: ReviewBlock,
};
