import {
  type AgendaDay,
  courseNamesView,
  daysBesideBriefing,
} from "../../../../shared/agenda/calendar-days";
import type { SchoolClock } from "../../../../shared/agenda/school-clock";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { TABLET_QUERY, useMediaQuery } from "../../../../shared/layout/use-media-query";
import { WeekBoard } from "./week-board";
import { WeekThread } from "./week-thread";

export interface WeekViewProps {
  days: readonly AgendaDay[];
  family: readonly ChildDto[];
  board: boolean;
  briefed: Pick<SchoolClock, "today" | "focus"> | null;
  onPick: (date: string) => void;
}

export function WeekView({ days, family, board, briefed, onPick }: WeekViewProps) {
  const besideBriefing = useMediaQuery(TABLET_QUERY);
  const courseNames = courseNamesView(days.flatMap((day) => day.deadlines));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {board ? (
        <WeekBoard days={days} family={family} courseNames={courseNames} />
      ) : (
        <WeekThread
          strip={days}
          days={daysBesideBriefing(days, besideBriefing ? null : briefed)}
          family={family}
          courseNames={courseNames}
          onPick={onPick}
        />
      )}
    </div>
  );
}
