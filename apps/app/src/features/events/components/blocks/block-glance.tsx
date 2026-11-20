import { DashboardPanelFigure } from "@packages/ui/components/ui/dashboard";
import { RollingCount } from "@packages/ui/components/ui/rolling-count";
import { TypographyInline, TypographyMuted } from "@packages/ui/components/ui/typography";
import type { EventItem } from "../../../../shared/api/queries/events";
import { EventLink } from "../../../../shared/events/event-link";
import { deadlineLabel } from "../../../../shared/format/deadline-label";

export interface BlockGlanceProps {
  events: readonly EventItem[];
  label: (count: number) => string;
  today: string;
}

export function BlockGlance({ events, label, today }: BlockGlanceProps) {
  const [nearest] = events;
  if (!nearest) return null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden [container-type:size] [@container(max-height:7.5rem)]:[&>[data-title]]:line-clamp-1">
      <DashboardPanelFigure>
        <RollingCount value={events.length} />
        <span>{label(events.length)}</span>
      </DashboardPanelFigure>
      <TypographyInline weight="semibold" className="line-clamp-2" data-title>
        <EventLink eventId={nearest.id}>{nearest.title}</EventLink>
      </TypographyInline>
      <TypographyMuted className="line-clamp-1">
        {deadlineLabel(nearest.deadlineDate, nearest.deadlineTime, today)}
      </TypographyMuted>
    </div>
  );
}
