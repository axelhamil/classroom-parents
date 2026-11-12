import { Button } from "@packages/ui/components/ui/button";
import { CalendarDay, CalendarDayCrunch } from "@packages/ui/components/ui/calendar-day";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { IconButton } from "@packages/ui/components/ui/icon-button";
import { FlameIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { dayLabel, wallDateParts } from "../../../../shared/format/deadline-label";
import { useIntlLocale } from "../../../../shared/i18n/use-intl-locale";
import { type CalendarDay as Day, type DayTone, dayTone, isCrunchDay } from "../../calendar";
import { CalendarEventRow } from "./calendar-event-row";

const STICKERS_MAX = 4;

const DATE_TAB_TONES = {
  today: "today",
  past: "muted",
  default: "default",
} as const satisfies Record<DayTone, string>;

export interface CalendarWeekColumnsProps {
  days: readonly Day[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}

export function CalendarWeekColumns({
  days,
  family,
  now,
  today,
  onAdd,
  onOpenDay,
}: CalendarWeekColumnsProps) {
  const { t } = useTranslation("events");
  const locale = useIntlLocale();

  return (
    <div className="grid grid-cols-7 items-start gap-2">
      {days.map((day) => {
        const parts = wallDateParts(day.date);
        const label = dayLabel(day.date, now);
        const crunch = isCrunchDay(day.date, day.events, today);
        const count = { day: label, count: day.events.length };
        const tone = dayTone(day.date, today);
        const hidden = day.events.length - STICKERS_MAX;
        const named = label.toLocaleLowerCase(locale);

        return (
          <CalendarDay
            key={day.date}
            aria-label={crunch ? t("calendar.dayCrunch", count) : t("calendar.day", count)}
            tone={tone}
            crunch={crunch}
            className="items-stretch"
          >
            <DateTab
              dateTime={day.date}
              tone={DATE_TAB_TONES[tone]}
              day={parts.day}
              month={parts.month}
              weekday={parts.weekday}
              aria-hidden
              className="self-center"
            />
            <CalendarDayCrunch className="self-center">
              <FlameIcon aria-hidden />
              {t("calendar.crunch")}
            </CalendarDayCrunch>
            <ul className="flex flex-col gap-2">
              {day.events.slice(0, STICKERS_MAX).map((event) => (
                <li key={event.id}>
                  <CalendarEventRow
                    event={event}
                    family={family}
                    now={now}
                    today={today}
                    density="sticker"
                  />
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("calendar.openDay", { count: hidden, day: named })}
                onClick={() => onOpenDay(day.date)}
              >
                {t("calendar.hidden", { count: hidden })}
              </Button>
            )}
            <IconButton
              variant="ghost"
              className="self-center"
              label={t("calendar.addOn", { day: named })}
              onClick={() => onAdd(day.date)}
            >
              <PlusIcon aria-hidden />
            </IconButton>
          </CalendarDay>
        );
      })}
    </div>
  );
}
