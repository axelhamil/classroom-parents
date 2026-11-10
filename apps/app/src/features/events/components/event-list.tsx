import { ListRow } from "@packages/ui/components/ui/list-row";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { EventItem } from "../api/events.queries";
import { EventRow } from "./event-row";

const VIRTUALIZE_ABOVE = 50;
const ESTIMATED_ROW_HEIGHT = 112;
const OVERSCAN_ROWS = 6;

export interface EventListProps {
  events: readonly EventItem[];
  childLabels: ReadonlyMap<string, string> | null;
  now: Date;
}

export function EventList(props: EventListProps) {
  return props.events.length > VIRTUALIZE_ABOVE ? (
    <VirtualEventList {...props} />
  ) : (
    <ol className="flex flex-col">
      {props.events.map((event) => (
        <ListRow key={event.id} variant="ruled">
          <EventRow
            event={event}
            childLabel={props.childLabels?.get(event.childId) ?? null}
            now={props.now}
          />
        </ListRow>
      ))}
    </ol>
  );
}

function VirtualEventList({ events, childLabels, now }: EventListProps) {
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
            variant="ruled"
            className="absolute inset-x-0 top-0"
            style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
          >
            <EventRow
              event={event}
              childLabel={childLabels?.get(event.childId) ?? null}
              now={now}
            />
          </ListRow>
        );
      })}
    </ol>
  );
}
