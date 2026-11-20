import {
  CalendarDay,
  CalendarDayList,
  CalendarDayMark,
  CalendarDayNote,
} from "@packages/ui/components/ui/calendar-day";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { AgendaDay, AgendaRun } from "../../../../shared/agenda/calendar-days";
import { WhenBadgeView } from "../../../../shared/agenda/when-meta";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { fullDateLabel, inSentence, wallDateParts } from "../../../../shared/format/deadline-label";
import { CalendarEventRow } from "./calendar-event-row";
import { useSummaryLabel } from "./use-summary-label";

export interface AgendaDayProps {
  day: AgendaDay;
  layout: "rail" | "column";
  /** A planner's empty column, narrowed to its date. */
  folded?: boolean;
  family: readonly ChildDto[];
  courseNames: ReadonlyMap<string, string>;
}

export function AgendaDaySection({
  day,
  layout,
  folded = false,
  family,
  courseNames,
}: AgendaDayProps) {
  const { t } = useTranslation("events");
  const summaryLabel = useSummaryLabel();
  const titleId = useId();
  const parts = wallDateParts(day.date);
  const quiet = day.deadlines.length === 0;
  const column = layout === "column";
  const urgent = day.badge?.tone === "urgent" ? day.badge : null;

  return (
    <CalendarDay
      aria-labelledby={titleId}
      aria-current={day.tone === "today" ? "date" : undefined}
      data-jump={day.date}
      tabIndex={-1}
      layout={layout}
      data-folded={folded || undefined}
      tone={day.tone}
      quiet={quiet}
    >
      <CalendarDayMark id={titleId}>
        <span data-part="weekday" aria-hidden>
          {column && !folded ? (
            <>
              <span className="@5xl:hidden">{parts.weekday}</span>
              <span className="hidden @5xl:inline">{parts.weekdayLong}</span>
            </>
          ) : (
            parts.weekday
          )}
        </span>
        <span data-part="day" aria-hidden>
          {parts.day}
        </span>
        <span className="sr-only">{fullDateLabel(day.date)}</span>
      </CalendarDayMark>
      {column ? (
        urgent &&
        !folded && (
          <CalendarDayNote>
            <WhenBadgeView badge={urgent} />
          </CalendarDayNote>
        )
      ) : (
        <CalendarDayNote>
          <WhenBadgeView badge={day.badge} />
          {quiet ? t("calendar.dayEmpty") : summaryLabel(day.summary)}
        </CalendarDayNote>
      )}
      {!quiet && (
        <CalendarDayList>
          {day.deadlines.map((event) => (
            <li key={event.id}>
              <CalendarEventRow
                event={event}
                family={family}
                courseName={event.course ? courseNames.get(event.course.id) : undefined}
                compact={column}
                withCategoryWord
              />
            </li>
          ))}
        </CalendarDayList>
      )}
    </CalendarDay>
  );
}

export interface QuietRunProps {
  run: Extract<AgendaRun, { kind: "quiet" }>;
}

/** Empty days in a row, folded into one line of the thread. */
export function QuietRunSection({ run }: QuietRunProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const first = wallDateParts(run.from);
  const last = wallDateParts(run.to);

  return (
    <CalendarDay
      aria-labelledby={titleId}
      data-jump={run.days.map((day) => day.date).join(" ")}
      tabIndex={-1}
      layout="rail"
      tone={run.days[0]?.tone}
      quiet
    >
      <CalendarDayMark id={titleId}>
        <span data-part="weekday" aria-hidden>
          {first.weekday}
        </span>
        <span data-part="day" aria-hidden>
          {t("calendar.quietDays", { from: first.day, to: last.day })}
        </span>
        <span className="sr-only">
          {t("calendar.range", {
            from: inSentence(fullDateLabel(run.from)),
            to: inSentence(fullDateLabel(run.to)),
          })}
        </span>
      </CalendarDayMark>
      <CalendarDayNote>{t("calendar.dayEmpty")}</CalendarDayNote>
    </CalendarDay>
  );
}
