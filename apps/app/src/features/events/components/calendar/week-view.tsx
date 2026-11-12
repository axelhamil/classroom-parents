import { HueDot } from "@packages/ui/components/ui/hue-dot";
import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { childHue } from "../../../../shared/format/child-hue";
import { dayLabel, wallDateParts } from "../../../../shared/format/deadline-label";
import { useMediaQuery, WIDE_QUERY } from "../../../../shared/layout/use-media-query";
import { type CalendarDay, isCrunchDay } from "../../calendar";
import { CalendarDaySection } from "./calendar-day-section";
import { CalendarWeekColumns } from "./calendar-week-columns";

export interface WeekViewProps {
  days: readonly CalendarDay[];
  anchor: string;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onSelect: (date: string) => void;
  onAdd: (date: string) => void;
  onOpenDay: (date: string) => void;
}

export function WeekView(props: WeekViewProps) {
  const wide = useMediaQuery(WIDE_QUERY);

  return wide ? <CalendarWeekColumns {...props} /> : <WeekRibbon {...props} />;
}

function childrenOf(day: CalendarDay, family: readonly ChildDto[]): ChildDto[] {
  return family.filter((child) => day.events.some((event) => event.childId === child.id));
}

function WeekRibbon({ days, anchor, family, now, today, onSelect, onAdd }: WeekViewProps) {
  const { t } = useTranslation("events");
  const selected = days.find((day) => day.date === anchor) ?? days[0];

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="day"
        size="day"
        spacing={1}
        aria-label={t("week.days")}
        value={selected?.date}
        onValueChange={(next) => next && onSelect(next)}
        className="grid w-full grid-cols-7"
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
      {selected && (
        <CalendarDaySection day={selected} family={family} now={now} today={today} onAdd={onAdd} />
      )}
    </div>
  );
}
