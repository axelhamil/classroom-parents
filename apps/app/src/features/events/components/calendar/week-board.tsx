import { CalendarWeek, CalendarWeekend } from "@packages/ui/components/ui/calendar-day";
import { useTranslation } from "react-i18next";
import {
  type AgendaDay,
  foldsInPlanner,
  weekSegments,
} from "../../../../shared/agenda/calendar-days";
import { useSchoolClock } from "../../../../shared/agenda/school-clock-context";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { AgendaDaySection } from "./agenda-day";

export interface WeekBoardProps {
  days: readonly AgendaDay[];
  family: readonly ChildDto[];
  courseNames: ReadonlyMap<string, string>;
}

/** The open planner of a wider block: one column per school day, the weekend stacked in one. */
export function WeekBoard({ days, family, courseNames }: WeekBoardProps) {
  const { t } = useTranslation("events");
  const { focus } = useSchoolClock();

  const folds = (day: AgendaDay) => foldsInPlanner(day, focus);

  const column = (day: AgendaDay) => (
    <AgendaDaySection
      key={day.date}
      day={day}
      layout="column"
      folded={folds(day)}
      family={family}
      courseNames={courseNames}
    />
  );

  return (
    <CalendarWeek arrangement="board">
      {weekSegments(days, (day) => day.date).map((segment) =>
        segment.weekend ? (
          <CalendarWeekend
            key={segment.items[0]?.date}
            label={t("calendar.weekend")}
            shortLabel={t("calendar.weekendShort")}
            folded={segment.items.every(folds)}
          >
            {segment.items.map(column)}
          </CalendarWeekend>
        ) : (
          segment.items.map(column)
        ),
      )}
    </CalendarWeek>
  );
}
