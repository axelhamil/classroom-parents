import { CalendarDayStrip } from "@packages/ui/components/ui/calendar-day";
import { HueDot } from "@packages/ui/components/ui/hue-dot";
import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgendaDay } from "../../../../shared/agenda/calendar-days";
import { useSchoolClock } from "../../../../shared/agenda/school-clock-context";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { childHue } from "../../../../shared/format/child-hue";
import { dayLabelFrom, wallDateParts } from "../../../../shared/format/deadline-label";
import { jumpToDay } from "../../calendar";

export interface WeekStripProps {
  days: readonly AgendaDay[];
  family: readonly ChildDto[];
  onPick: (date: string) => void;
}

function childrenOf(day: AgendaDay, family: readonly ChildDto[]): ChildDto[] {
  return family.filter((child) => day.deadlines.some((event) => event.childId === child.id));
}

export function WeekStrip({ days, family, onPick }: WeekStripProps) {
  const { t } = useTranslation("events");
  const clock = useSchoolClock();
  const [picked, setPicked] = useState<string | null>(null);
  const shown = days.find((day) => day.date === picked) ?? days[0];

  const pick = (next: string) => {
    const date = next || shown?.date;
    if (!date) return;

    setPicked(date);
    onPick(date);
    jumpToDay(date);
  };

  return (
    <CalendarDayStrip>
      <ToggleGroup
        type="single"
        variant="day"
        size="day"
        spacing={1}
        aria-label={t("week.days")}
        value={shown?.date}
        onValueChange={pick}
        className="grid w-full grid-cols-7"
      >
        {days.map((day) => {
          const parts = wallDateParts(day.date);
          const label = { day: dayLabelFrom(day.date, clock.today), count: day.summary.count };

          return (
            <ToggleGroupItem
              key={day.date}
              value={day.date}
              data-today={day.tone === "today"}
              data-crunch={day.crunch}
              aria-current={day.tone === "today" ? "date" : undefined}
              aria-label={day.crunch ? t("calendar.dayCrunch", label) : t("calendar.day", label)}
            >
              <span data-part="weekday">{parts.weekday}</span>
              <span data-part="day">{parts.day}</span>
              <span data-part="count" aria-hidden>
                {day.summary.count || ""}
              </span>
              {family.length > 1 && (
                <span data-part="dots">
                  {childrenOf(day, family).map((child) => (
                    <HueDot key={child.id} hue={childHue(family, child.id)} />
                  ))}
                </span>
              )}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </CalendarDayStrip>
  );
}
