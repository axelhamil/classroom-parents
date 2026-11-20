import { CalendarWeek, CalendarWeekend } from "@packages/ui/components/ui/calendar-day";
import { useTranslation } from "react-i18next";
import {
  type AgendaDay,
  type AgendaRun,
  quietRuns,
  weekSegments,
} from "../../../../shared/agenda/calendar-days";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { AgendaDaySection, QuietRunSection } from "./agenda-day";
import { WeekStrip } from "./week-strip";

export interface WeekThreadProps {
  strip: readonly AgendaDay[];
  days: readonly AgendaDay[];
  family: readonly ChildDto[];
  courseNames: ReadonlyMap<string, string>;
  onPick: (date: string) => void;
}

const firstDateOf = (run: AgendaRun) => (run.kind === "day" ? run.day.date : run.from);

const segmentKey = ([first]: readonly AgendaRun[]) => (first ? firstDateOf(first) : "weekend");

/** The phone's week: the strip of seven days, then one reading column, empty days folded. */
export function WeekThread({ strip, days, family, courseNames, onPick }: WeekThreadProps) {
  const { t } = useTranslation("events");
  const segments = weekSegments(quietRuns(days), firstDateOf);

  const section = (run: AgendaRun) =>
    run.kind === "day" ? (
      <AgendaDaySection
        key={run.day.date}
        day={run.day}
        layout="rail"
        family={family}
        courseNames={courseNames}
      />
    ) : (
      <QuietRunSection key={run.from} run={run} />
    );

  return (
    <>
      <WeekStrip days={strip} family={family} onPick={onPick} />
      <CalendarWeek arrangement="fil">
        {segments.map((segment) =>
          segment.weekend ? (
            <CalendarWeekend key={segmentKey(segment.items)} label={t("calendar.weekend")}>
              {segment.items.map(section)}
            </CalendarWeekend>
          ) : (
            segment.items.map(section)
          ),
        )}
      </CalendarWeek>
    </>
  );
}
