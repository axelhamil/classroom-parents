import { ListRowButton, ListRowContent, ListRowMeta } from "@packages/ui/components/ui/list-row";
import { TypographyInline } from "@packages/ui/components/ui/typography";
import { Link } from "@tanstack/react-router";
import { deadlineLabel } from "../../../shared/format/deadline-label";
import type { EventItem } from "../api/events.queries";
import { DeadlineTab } from "./deadline-tab";
import { EventBadges } from "./event-badges";

export interface EventRowProps {
  event: EventItem;
  childLabel: string | null;
  now: Date;
}

export function EventRow({ event, childLabel, now }: EventRowProps) {
  return (
    <ListRowButton asChild className="w-full flex-row gap-3">
      <Link to="/events/$eventId" params={{ eventId: event.id }}>
        <DeadlineTab date={event.deadlineDate} now={now} />
        <ListRowContent className="min-w-0 flex-1">
          <TypographyInline weight="semibold" className="line-clamp-2 wrap-anywhere">
            {event.title}
          </TypographyInline>
          <ListRowMeta className="flex-wrap">
            <TypographyInline tone="muted" size="sm">
              {deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
            </TypographyInline>
            {childLabel && (
              <TypographyInline tone="muted" size="sm" weight="medium">
                {childLabel}
              </TypographyInline>
            )}
          </ListRowMeta>
          <EventBadges event={event} />
        </ListRowContent>
      </Link>
    </ListRowButton>
  );
}
