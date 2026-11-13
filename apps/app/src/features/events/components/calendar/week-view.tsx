import { CalendarWeek } from "@packages/ui/components/ui/calendar-day";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { TABLET_QUERY, useMediaQuery } from "../../../../shared/layout/use-media-query";
import type { CalendarDay } from "../../calendar";
import { CalendarDaySection } from "./calendar-day-section";

export interface WeekViewProps {
  days: readonly CalendarDay[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
  briefed: string;
  onAdd: (date: string) => void;
}

export function WeekView({ days, briefed, ...section }: WeekViewProps) {
  const besideBriefing = useMediaQuery(TABLET_QUERY);
  const rows = besideBriefing ? days : days.filter((day) => day.date !== briefed);

  return (
    <CalendarWeek>
      {rows.map((day) => (
        <CalendarDaySection key={day.date} day={day} layout="row" {...section} />
      ))}
    </CalendarWeek>
  );
}
