import { Button } from "@packages/ui/components/ui/button";
import { ListRow, ListRowAction } from "@packages/ui/components/ui/list-row";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, SearchCheckIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../../../shared/api/queries/events";
import { EventCard } from "../../../shared/events/event-card";
import type { ChildHue } from "../../../shared/format/child-hue";
import { ResponsiveOverlay } from "../../../shared/layout/responsive-overlay";
import { useConfirmEvent } from "../hooks/use-confirm-event";
import { ReviewReasons } from "./review-reasons";

export interface ReviewLineProps {
  events: readonly EventItem[];
  childLabel: (childId: string) => string;
  childColor: (childId: string) => ChildHue;
}

export function ReviewLine({ events, childLabel, childColor }: ReviewLineProps) {
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
          variant="outline"
          className="w-full"
          aria-haspopup="dialog"
          onClick={() => setOpened(events.map((event) => event.id))}
        >
          <SearchCheckIcon aria-hidden />
          {title}
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

function ReviewList({ events, childLabel, childColor }: ReviewLineProps) {
  const { t } = useTranslation("events");
  const confirm = useConfirmEvent();

  return (
    <ScrollRegion variant="list" label={t("review.title")}>
      <ul className="flex flex-col gap-3">
        {events.map((event) => (
          <ListRow key={event.id} variant="plain" className="flex-col items-stretch">
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
          </ListRow>
        ))}
      </ul>
    </ScrollRegion>
  );
}
