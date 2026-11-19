import { TypographyDisplay } from "@packages/ui/components/ui/typography";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveOverlay } from "../../../shared/layout/responsive-overlay";
import { arrive } from "../../../shared/motion/deadline-morph";
import { QueryState } from "../../../shared/query/query-state";
import { calendarEventOf, eventQueryOptions } from "../api/events.queries";
import { EventDetailBody, EventDetailSkeleton } from "./event-detail-body";
import { EventEyebrow, EventOrigin } from "./event-when";

function focusTargets(opener: HTMLElement | null): HTMLElement[] {
  const headings: HTMLElement[] = [];
  for (let section = opener?.closest("section[aria-labelledby]"); section; ) {
    const heading = document.getElementById(section.getAttribute("aria-labelledby") ?? "");
    if (heading) headings.push(heading);
    section = section.parentElement?.closest("section[aria-labelledby]");
  }

  return [...(opener ? [opener] : []), ...headings];
}

export interface EventOverlayProps {
  eventId: string;
  onClose: () => void;
}

export function EventOverlay({ eventId, onClose }: EventOverlayProps) {
  const { t } = useTranslation("events");
  const queryClient = useQueryClient();
  const query = useQuery({
    ...eventQueryOptions(eventId),
    placeholderData: () => calendarEventOf(queryClient, eventId),
  });
  const event = query.data;
  const [targets] = useState(() =>
    focusTargets(document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );
  useLayoutEffect(arrive, []);

  return (
    <ResponsiveOverlay
      docked="sheet"
      eyebrow={event && <EventEyebrow event={event} />}
      title={<TypographyDisplay>{event?.title ?? t("detail.title")}</TypographyDisplay>}
      description={event ? <EventOrigin event={event} /> : t("detail.title")}
      descriptionHidden={!event}
      returnFocus={() => targets}
      onClose={onClose}
    >
      <QueryState query={query} skeleton={<EventDetailSkeleton />}>
        {(event) => <EventDetailBody event={event} onDeleted={onClose} />}
      </QueryState>
    </ResponsiveOverlay>
  );
}
