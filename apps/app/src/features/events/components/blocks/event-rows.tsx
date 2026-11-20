import type { ReactNode } from "react";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { CalendarEventRow } from "../calendar/calendar-event-row";

export interface EventRowsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  withChild?: boolean;
  steps?: (event: EventItem) => ReactNode;
}

export function EventRows({ events, family, withChild, steps }: EventRowsProps) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id}>
          <CalendarEventRow event={event} family={family} dated withChild={withChild} withCountdown>
            {steps?.(event)}
          </CalendarEventRow>
        </li>
      ))}
    </ul>
  );
}
