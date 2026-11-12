import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { CalendarDay } from "../../calendar";
import { CalendarDaySection } from "./calendar-day-section";

const VIRTUALIZE_ABOVE = 50;
const ESTIMATED_ROW_HEIGHT = 76;
const DAY_HEADER_HEIGHT = 52;
const OVERSCAN_DAYS = 2;

export interface AgendaViewProps {
  days: readonly CalendarDay[];
  anchor: string;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onAdd: (date: string) => void;
}

export function AgendaView(props: AgendaViewProps) {
  const { days, anchor } = props;
  const shown = days.filter((day) => day.date === anchor || day.events.length > 0);
  const total = shown.reduce((count, day) => count + day.events.length, 0);

  return total > VIRTUALIZE_ABOVE ? (
    <VirtualAgenda {...props} days={shown} />
  ) : (
    <div className="flex flex-col gap-6">
      {shown.map((day) => (
        <CalendarDaySection key={day.date} day={day} {...props} />
      ))}
    </div>
  );
}

function VirtualAgenda({ days, family, now, today, onAdd }: AgendaViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useWindowVirtualizer({
    count: days.length,
    estimateSize: (index) =>
      DAY_HEADER_HEIGHT + (days[index]?.events.length ?? 0) * ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_DAYS,
    scrollMargin: listRef.current?.offsetTop ?? 0,
    getItemKey: (index) => days[index]?.date ?? index,
  });

  return (
    <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => {
        const day = days[row.index];
        if (!day) return null;

        return (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className="absolute inset-x-0 top-0 pb-6"
            style={{ transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)` }}
          >
            <CalendarDaySection day={day} family={family} now={now} today={today} onAdd={onAdd} />
          </div>
        );
      })}
    </div>
  );
}
