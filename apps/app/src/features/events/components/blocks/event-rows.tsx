import { type ReactNode, useId } from "react";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { CalendarEventRow } from "../calendar/calendar-event-row";
import { ShowMoreButton, useShowMore } from "./show-more";

export interface EventRowsProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
  rows: number;
  withChild?: boolean;
  steps?: (event: EventItem) => ReactNode;
}

export function EventRows({ events, family, now, today, rows, withChild, steps }: EventRowsProps) {
  const listId = useId();
  const { shown, more } = useShowMore(events, rows);

  return (
    <>
      <ul id={listId} className="flex flex-col gap-2">
        {shown.map((event) => (
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
      <ShowMoreButton more={more} controls={listId} />
    </>
  );
}

export function forChild(events: readonly EventItem[], childId: string | null): EventItem[] {
  return events.filter((event) => childId === null || event.childId === childId);
}
