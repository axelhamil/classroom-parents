import { DashboardPanelEmpty, DashboardPanelFigure } from "@packages/ui/components/ui/dashboard";
import { IconTile } from "@packages/ui/components/ui/icon-tile";
import { AllDoneIcon, ConfirmDateIcon } from "@packages/ui/components/ui/icons";
import { RollingCount } from "@packages/ui/components/ui/rolling-count";
import { TypographyMuted } from "@packages/ui/components/ui/typography";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, type Ref, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { reviewView } from "../../../../shared/agenda/views";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { deadlineLabel, inSentence } from "../../../../shared/format/deadline-label";
import { lateBacklogQueryOptions, reviewEventsQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useReviewConfirmation } from "../../hooks/use-review-confirmation";
import { mainReviewSentenceKey } from "../../review-labels";
import { ReviewLine } from "../review-line";
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

  const pastNote = past.length > 0 && (
    <TypographyMuted className="line-clamp-2">
      {t("blocks.review.past", { count: past.length })}
    </TypographyMuted>
  );

  return (
    <BlockPanel title={title} icon={ConfirmDateIcon}>
      {coming.isSuccess && upcoming.length === 0 && (
        <AllClear ref={handOver ? takeFocus : undefined} pastNote={pastNote} />
      )}
      {upcoming.length > 0 && (
        <>
          <ReviewFigure events={upcoming} family={family} />
          <ReviewGlance events={upcoming} today={clock.today} />
          <ReviewRows
            events={upcoming}
            family={family}
            today={clock.today}
            confirm={confirm}
            onLastLeft={() => setHandOver(true)}
          />
          {pastNote}
        </>
      )}
    </BlockPanel>
  );
}

interface AllClearProps {
  ref?: Ref<HTMLDivElement>;
  pastNote: ReactNode;
}

function AllClear({ ref, pastNote }: AllClearProps) {
  const { t } = useTranslation("home");

  return (
    <DashboardPanelEmpty ref={ref} tabIndex={-1}>
      <IconTile>
        <AllDoneIcon aria-hidden />
      </IconTile>
      <p>{t("blocks.review.empty")}</p>
      {pastNote || <p>{t("blocks.review.emptyHint")}</p>}
    </DashboardPanelEmpty>
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
      />
    </DashboardPanelFigure>
  );
}

interface ReviewGlanceProps {
  events: readonly EventItem[];
  today: string;
}

function ReviewGlance({ events, today }: ReviewGlanceProps) {
  const { t } = useTranslation(["home", "events"]);
  const [nearest] = events;
  if (!nearest) return null;

  const when = inSentence(deadlineLabel(nearest.deadlineDate, nearest.deadlineTime, today));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden md:contain-size @2xs/panel:hidden">
      <TypographyMuted className="line-clamp-2">
        {t(mainReviewSentenceKey(events), { ns: "events" })}
      </TypographyMuted>
      <TypographyMuted className="line-clamp-1">
        {t("blocks.review.nearest", { title: nearest.title, when })}
      </TypographyMuted>
    </div>
  );
}

export const reviewBlock: HomeBlockDefinition = {
  id: "review",
  titleKey: "blocks.review.title",
  descriptionKey: "blocks.review.description",
  icon: ConfirmDateIcon,
  sizes: { w: [3, 4, 6, 8, 12], h: [1, 2] },
  defaultSize: { w: 4, h: 1 },
  Component: ReviewBlock,
};
