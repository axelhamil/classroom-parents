import { Button } from "@packages/ui/components/ui/button";
import {
  CalendarDay,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayNote,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@packages/ui/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { calendarEventsQueryOptions } from "../../api/events.queries";
import { isOverdue, OVERDUE_WINDOW_DAYS, overdueWindow } from "../../calendar";
import { CalendarEventRow } from "./calendar-event-row";

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

  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <CalendarDay aria-labelledby={titleId} tone="overdue">
        <CalendarDayHeader>
          <CalendarDayTitle id={titleId}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between">
                {t("calendar.overdueCount", { count: late.length })}
                <Chevron aria-hidden />
              </Button>
            </CollapsibleTrigger>
          </CalendarDayTitle>
        </CalendarDayHeader>
        <CollapsibleContent className="flex flex-col gap-2">
          <CalendarDayNote>
            {t("calendar.overdueWindow", { count: OVERDUE_WINDOW_DAYS })}
          </CalendarDayNote>
          <CalendarDayList>
            {late.map((event) => (
              <li key={event.id}>
                <CalendarEventRow event={event} family={family} now={now} today={today} dated />
              </li>
            ))}
          </CalendarDayList>
        </CollapsibleContent>
      </CalendarDay>
    </Collapsible>
  );
}
