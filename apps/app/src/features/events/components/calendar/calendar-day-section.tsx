import {
  CalendarDay,
  CalendarDayCrunch,
  CalendarDayEmpty,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { AddIcon, BusyDayIcon } from "@packages/ui/components/ui/icons";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { dayTone, isCrunchDay } from "../../../../shared/agenda/calendar-days";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { dayLabel, inSentence } from "../../../../shared/format/deadline-label";
import type { CalendarDay as Day } from "../../calendar";
import { CalendarEventRow } from "./calendar-event-row";

export interface CalendarDaySectionProps {
  day: Day;
  family: readonly ChildDto[];
  today: string;
  onAdd: (date: string) => void;
  layout?: "stack" | "row";
}

export function CalendarDaySection({ day, family, today, onAdd, layout }: CalendarDaySectionProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const title = dayLabel(day.date, today);
  const quiet = day.events.length === 0;

  return (
    <CalendarDay
      aria-labelledby={titleId}
      data-jump={day.date}
      tabIndex={-1}
      layout={layout}
      tone={dayTone(day.date, today)}
      crunch={isCrunchDay(day.date, day.events, today)}
      quiet={quiet}
    >
      <CalendarDayHeader>
        <CalendarDayTitle id={titleId}>{title}</CalendarDayTitle>
        <CalendarDayCrunch>
          <BusyDayIcon aria-hidden />
          {t("calendar.crunch")}
        </CalendarDayCrunch>
        {quiet && <CalendarDayEmpty>{t("calendar.dayEmpty")}</CalendarDayEmpty>}
        <IconButton
          variant="ghost"
          size={quiet ? "icon-sm" : "icon"}
          label={t("calendar.addOn", { day: inSentence(title) })}
          onClick={() => onAdd(day.date)}
        >
          <AddIcon aria-hidden />
        </IconButton>
      </CalendarDayHeader>
      {!quiet && (
        <CalendarDayList>
          {day.events.map((event) => (
            <li key={event.id}>
              <CalendarEventRow event={event} family={family} withCountdown />
            </li>
          ))}
        </CalendarDayList>
      )}
    </CalendarDay>
  );
}
