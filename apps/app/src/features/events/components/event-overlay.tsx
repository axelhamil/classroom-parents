import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveOverlay } from "../../../shared/layout/responsive-overlay";
import { QueryState } from "../../../shared/query/query-state";
import { eventQueryOptions } from "../api/events.queries";
import { EventDetailBody, EventDetailSkeleton } from "./event-detail-body";

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
  const query = useQuery(eventQueryOptions(eventId));
  const [targets] = useState(() =>
    focusTargets(document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );

  return (
    <ResponsiveOverlay
      docked="sheet"
      title={query.data?.title ?? t("detail.title")}
      description={t("detail.title")}
      descriptionHidden
      returnFocus={() => targets}
      onClose={onClose}
    >
      <QueryState query={query} skeleton={<EventDetailSkeleton />}>
        {(event) => <EventDetailBody event={event} onDeleted={onClose} />}
      </QueryState>
    </ResponsiveOverlay>
  );
}
