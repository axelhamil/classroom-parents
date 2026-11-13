import {
  CalendarDay,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import { ScrollRegion } from "@packages/ui/components/ui/scroll-region";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { dayLabel } from "../../../../shared/format/deadline-label";
import { CalendarEventRow } from "./calendar-event-row";

export interface OverdueListProps {
  events: readonly EventItem[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
}

function byDate(events: readonly EventItem[]): [string, EventItem[]][] {
  const groups = new Map<string, EventItem[]>();
  for (const event of events)
    groups.set(event.deadlineDate, [...(groups.get(event.deadlineDate) ?? []), event]);

  return [...groups];
}

export function OverdueList({ events, family, now, today }: OverdueListProps) {
  const { t } = useTranslation("events");
  const groupId = useId();

  return (
    <ScrollRegion variant="list" label={t("calendar.overdueList")}>
      <div className="flex flex-col gap-3">
        {byDate(events).map(([date, due]) => (
          <CalendarDay key={date} tone="past" aria-labelledby={`${groupId}${date}`}>
            <CalendarDayHeader>
              <CalendarDayTitle id={`${groupId}${date}`}>{dayLabel(date, now)}</CalendarDayTitle>
            </CalendarDayHeader>
            <CalendarDayList>
              {due.map((event) => (
                <li key={event.id}>
                  <CalendarEventRow event={event} family={family} now={now} today={today} compact />
                </li>
              ))}
            </CalendarDayList>
          </CalendarDay>
        ))}
      </div>
    </ScrollRegion>
  );
}
