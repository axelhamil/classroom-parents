import { Button } from "@packages/ui/components/ui/button";
import { ListRowAction } from "@packages/ui/components/ui/list-row";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, SearchCheckIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue } from "../../../shared/format/child-hue";
import { ResponsiveOverlay } from "../../../shared/layout/responsive-overlay";
import { VirtualList } from "../../../shared/virtual/virtual-list";
import { useConfirmEvent } from "../hooks/use-confirm-event";
import { ReviewReasons } from "./review-reasons";

const REVIEW_ROW_HEIGHT = 260;

export interface ReviewListProps {
  events: readonly EventItem[];
  childLabel: (childId: string) => string;
  childColor: (childId: string) => ChildHue;
}

export interface ReviewLineProps extends ReviewListProps {
  stretched?: boolean;
  label?: string;
}

/**
 * The count of dates to check, opening them in a dialog. `stretched` lays the
 * trigger over its whole positioned parent: the line of a block is the button.
 * `label` names a trigger that shows only its chevron, when the count is already
 * written beside it.
 */
export function ReviewLine({ events, childLabel, childColor, stretched, label }: ReviewLineProps) {
  const { t } = useTranslation("events");
  const trigger = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<readonly string[] | null>(null);
  const shown = events.filter((event) => opened?.includes(event.id));
  if (opened && shown.length === 0) setOpened(null);
  const title = t("review.count", { count: events.length });

  return (
    <>
      {events.length > 0 && (
        <Button
          ref={trigger}
          variant={stretched ? "ghost" : "outline"}
          size={stretched ? "icon-sm" : "default"}
          className={
            stretched ? "ms-auto after:absolute after:inset-0 @2xs/panel:after:hidden" : "w-full"
          }
          aria-haspopup="dialog"
          aria-label={label}
          onClick={() => setOpened(events.map((event) => event.id))}
        >
          {!stretched && <SearchCheckIcon aria-hidden />}
          {!label && title}
          <ChevronRightIcon aria-hidden className="ms-auto" />
        </Button>
      )}
      {opened && shown.length > 0 && (
        <ResponsiveOverlay
          docked="dialog"
          title={t("review.count", { count: shown.length })}
          description={t("review.description")}
          returnFocus={() => (trigger.current ? [trigger.current] : [])}
          onClose={() => setOpened(null)}
        >
          <ReviewList events={shown} childLabel={childLabel} childColor={childColor} />
        </ResponsiveOverlay>
      )}
    </>
  );
}

function ReviewList({ events, childLabel, childColor }: ReviewListProps) {
  const { t } = useTranslation("events");
  const confirm = useConfirmEvent();

  return (
    <ScrollRegion variant="list" label={t("review.title")}>
      <VirtualList
        items={events}
        keyOf={(event) => event.id}
        scroller="region"
        estimatedRowHeight={REVIEW_ROW_HEIGHT}
        rowClassName="flex-col items-stretch pb-3"
      >
        {(event) => (
          <>
            <EventCard
              event={event}
              childLabel={childLabel(event.childId)}
              hue={childColor(event.childId)}
              markReview={false}
            />
            <ReviewReasons event={event} />
            <ListRowAction>
              <Button
                type="button"
                size="sm"
                disabled={confirm.isPending && confirm.variables === event.id}
                onClick={() => confirm.mutate(event.id)}
              >
                {t("review.confirm")}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/events/$eventId/edit" params={{ eventId: event.id }}>
                  {t("review.edit")}
                </Link>
              </Button>
            </ListRowAction>
          </>
        )}
      </VirtualList>
    </ScrollRegion>
  );
}
