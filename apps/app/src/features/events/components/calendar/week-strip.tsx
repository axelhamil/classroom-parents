import { HueDot } from "@packages/ui/components/ui/hue-dot";
import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { childHue } from "../../../../shared/format/child-hue";
import { dayLabel, wallDateParts } from "../../../../shared/format/deadline-label";
import { type CalendarDay, isCrunchDay, jumpToDay } from "../../calendar";

export interface WeekStripProps {
  days: readonly CalendarDay[];
  family: readonly ChildDto[];
  now: Date;
  today: string;
}

function childrenOf(day: CalendarDay, family: readonly ChildDto[]): ChildDto[] {
  return family.filter((child) => day.events.some((event) => event.childId === child.id));
}

export function WeekStrip({ days, family, now, today }: WeekStripProps) {
  const { t } = useTranslation("events");
  const [picked, setPicked] = useState<string | null>(null);
  const shown = days.find((day) => day.date === picked) ?? days[0];

  const pick = (next: string) => {
    const date = next || shown?.date;
    if (!date) return;

    setPicked(date);
    jumpToDay(date);
  };

  return (
    <ToggleGroup
      type="single"
      variant="day"
      size="day"
      spacing={1}
      aria-label={t("week.days")}
      value={shown?.date}
      onValueChange={pick}
      className="grid w-full grid-cols-7 md:hidden"
    >
      {days.map((day) => {
        const parts = wallDateParts(day.date);
        const crunch = isCrunchDay(day.date, day.events, today);
        const label = { day: dayLabel(day.date, now), count: day.events.length };

        return (
          <ToggleGroupItem
            key={day.date}
            value={day.date}
            data-today={day.date === today}
            data-crunch={crunch}
            aria-label={crunch ? t("calendar.dayCrunch", label) : t("calendar.day", label)}
          >
            <span data-part="weekday">{parts.weekday}</span>
            <span data-part="day">{parts.day}</span>
            <span data-part="dots">
              {childrenOf(day, family).map((child) => (
                <HueDot key={child.id} hue={childHue(family, child.id)} />
              ))}
            </span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
