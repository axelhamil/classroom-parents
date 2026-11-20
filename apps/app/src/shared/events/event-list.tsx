import type { EventItem } from "../api/queries/events";
import type { ChildHue, DeadlineSurface } from "../format/child-hue";
import { VirtualList } from "../virtual/virtual-list";
import { EventCard } from "./event-card";

const ESTIMATED_ROW_HEIGHT = 128;

export interface EventListProps {
  events: readonly EventItem[];
  childLabel: (childId: string) => string;
  childColor: (childId: string) => ChildHue;
  surface: DeadlineSurface;
  muted: boolean;
}

export function EventList({ events, childLabel, childColor, surface, muted }: EventListProps) {
  return (
    <VirtualList
      items={events}
      keyOf={(event) => event.id}
      scroller="page"
      estimatedRowHeight={ESTIMATED_ROW_HEIGHT}
      ordered
    >
      {(event) => (
        <EventCard
          event={event}
          childLabel={childLabel(event.childId)}
          hue={childColor(event.childId)}
          surface={surface}
          muted={muted}
        />
      )}
    </VirtualList>
  );
}
