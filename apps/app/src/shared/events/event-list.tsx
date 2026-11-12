import { ListRow } from "@packages/ui/components/ui/list-row";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { EventItem } from "../api/queries/events";
import type { ChildHue } from "../format/child-hue";
import { EventCard } from "./event-card";

const VIRTUALIZE_ABOVE = 50;
const ESTIMATED_ROW_HEIGHT = 128;
const OVERSCAN_ROWS = 6;

export interface EventListProps {
  events: readonly EventItem[];
  childLabel: (childId: string) => string;
  childColor: (childId: string) => ChildHue;
  muted: boolean;
}

export function EventList(props: EventListProps) {
  const { events, childLabel, childColor, muted } = props;

  return events.length > VIRTUALIZE_ABOVE ? (
    <VirtualEventList {...props} />
  ) : (
    <ol className="flex flex-col">
      {events.map((event) => (
        <ListRow key={event.id} variant="plain">
          <EventCard
            event={event}
            childLabel={childLabel(event.childId)}
            hue={childColor(event.childId)}
            muted={muted}
          />
        </ListRow>
      ))}
    </ol>
  );
}

function VirtualEventList({ events, childLabel, childColor, muted }: EventListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: events.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => events[index]?.id ?? index,
  });

  return (
    <ol ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const event = events[row.index];
        if (!event) return null;

        return (
          <ListRow
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            variant="plain"
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
          >
            <EventCard
              event={event}
              childLabel={childLabel(event.childId)}
              hue={childColor(event.childId)}
              muted={muted}
            />
          </ListRow>
        );
      })}
    </ol>
  );
}
