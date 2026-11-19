import type { ReactNode } from "react";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { CalendarEventRow } from "../calendar/calendar-event-row";

export interface EventRowsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
  withChild?: boolean;
  steps?: (event: EventItem) => ReactNode;
}

export function EventRows({ events, family, now, today, withChild, steps }: EventRowsProps) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id}>
          <CalendarEventRow
            event={event}
            family={family}
            now={now}
            today={today}
            dated
            withChild={withChild}
            withCountdown
          >
            {steps?.(event)}
          </CalendarEventRow>
        </li>
      ))}
    </ul>
  );
}

export function forChild(events: readonly EventItem[], childId: string | null): EventItem[] {
  return events.filter((event) => childId === null || event.childId === childId);
}
