import {
  CalendarDay,
  CalendarDayCrunch,
  CalendarDayEmpty,
  CalendarDayHeader,
  CalendarDayList,
  CalendarDayTitle,
} from "@packages/ui/components/ui/calendar-day";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { FlameIcon, PlusIcon } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { dayLabel } from "../../../../shared/format/deadline-label";
import { useIntlLocale } from "../../../../shared/i18n/use-intl-locale";
import { type CalendarDay as Day, dayTone, isCrunchDay } from "../../calendar";
import { isEvening } from "../../week";
import { CalendarEventRow } from "./calendar-event-row";

export interface CalendarDaySectionProps {
  day: Day;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onAdd: (date: string) => void;
}

export function CalendarDaySection({ day, family, now, today, onAdd }: CalendarDaySectionProps) {
  const { t } = useTranslation("events");
  const locale = useIntlLocale();
  const titleId = useId();
  const title =
    day.date === today && isEvening(now) ? t("calendar.tonight") : dayLabel(day.date, now);

  return (
    <CalendarDay
      aria-labelledby={titleId}
      tone={dayTone(day.date, today)}
      crunch={isCrunchDay(day.date, day.events, today)}
    >
      <CalendarDayHeader>
        <CalendarDayTitle id={titleId}>{title}</CalendarDayTitle>
        <CalendarDayCrunch>
          <FlameIcon aria-hidden />
          {t("calendar.crunch")}
        </CalendarDayCrunch>
        <IconButton
          variant="ghost"
          label={t("calendar.addOn", { day: title.toLocaleLowerCase(locale) })}
          onClick={() => onAdd(day.date)}
        >
          <PlusIcon aria-hidden />
        </IconButton>
      </CalendarDayHeader>
      {day.events.length === 0 ? (
        <CalendarDayEmpty>{t("calendar.dayEmpty")}</CalendarDayEmpty>
      ) : (
        <CalendarDayList>
          {day.events.map((event) => (
            <li key={event.id}>
              <CalendarEventRow event={event} family={family} now={now} today={today} />
            </li>
          ))}
        </CalendarDayList>
      )}
    </CalendarDay>
  );
}
