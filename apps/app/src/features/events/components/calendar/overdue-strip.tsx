import { Button } from "@packages/ui/components/ui/button";
import {
  CalendarDay,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayNote,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import { isOverdue, OVERDUE_WINDOW_DAYS, overdueWindow } from "../../calendar";
import { CalendarEventRow } from "./calendar-event-row";

const SHOWN_AT_FIRST = 3;

export interface OverdueStripProps {
  family: readonly ChildDto[];
  childId: string | null;
  now: Date;
  today: string;
  before: string;
}

export function OverdueStrip({ family, childId, now, today, before }: OverdueStripProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const late = (useQuery(calendarEventsQueryOptions(overdueWindow(today))).data ?? [])
    .filter(
      (event) =>
        isOverdue(event, today) &&
        event.deadlineDate < before &&
        (childId === null || event.childId === childId),
    )
    .sort((left, right) => right.deadlineDate.localeCompare(left.deadlineDate));
  if (late.length === 0) return null;

  const shown = open ? late : late.slice(0, SHOWN_AT_FIRST);
  const hidden = late.length - shown.length;

  return (
    <CalendarDay aria-labelledby={titleId} tone="overdue">
      <CalendarDayHeader>
        <CalendarDayTitle id={titleId}>{t("calendar.overdue")}</CalendarDayTitle>
      </CalendarDayHeader>
      <CalendarDayNote>
        {t("calendar.overdueWindow", { count: OVERDUE_WINDOW_DAYS })}
      </CalendarDayNote>
      <CalendarDayList>
        {shown.map((event) => (
          <li key={event.id}>
            <CalendarEventRow event={event} family={family} now={now} today={today} dated />
          </li>
        ))}
      </CalendarDayList>
      {hidden > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
          {t("calendar.overdueMore", { count: hidden })}
        </Button>
      )}
    </CalendarDay>
  );
}
