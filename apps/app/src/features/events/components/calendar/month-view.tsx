import { wallDateLabel } from "@packages/i18n";
import { HueDot } from "@packages/ui/components/ui/hue-dot";
import {
  MonthPlanner,
  MonthPlannerChip,
  MonthPlannerChips,
  MonthPlannerDots,
  MonthPlannerMore,
} from "@packages/ui/components/ui/month-planner";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import { childHue } from "../../../../shared/format/child-hue";
import { isoDay, localDay } from "../../../../shared/format/local-day";
import { useMediaQuery, WIDE_QUERY } from "../../../../shared/layout/use-media-query";
import { type CalendarDay, isCrunchDay } from "../../calendar";
import { CalendarDaySection } from "./calendar-day-section";

const DOTS_MAX = 3;
const CHIPS_MAX = 3;

export interface MonthViewProps {
  days: readonly CalendarDay[];
  anchor: string;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  onSelect: (date: string) => void;
  onAdd: (date: string) => void;
  emptyPeriod: ReactNode;
}

export function MonthView({
  days,
  anchor,
  family,
  now,
  today,
  onSelect,
  onAdd,
  emptyPeriod,
}: MonthViewProps) {
  const { t } = useTranslation("events");
  const wide = useMediaQuery(WIDE_QUERY);
  const anchorMonth = anchor.slice(0, 7);
  const [shown, setShown] = useState({ anchorMonth, month: anchorMonth });
  if (shown.anchorMonth !== anchorMonth) setShown({ anchorMonth, month: anchorMonth });
  const byDate = new Map(days.map((day) => [day.date, day]));
  const selected = byDate.get(anchor) ?? { date: anchor, events: [] };
  const crunch = days
    .filter((day) => isCrunchDay(day.date, day.events, today))
    .map((day) => localDay(day.date));

  const dayContent = (date: Date) => {
    const events = byDate.get(isoDay(date))?.events ?? [];
    if (events.length === 0) return null;
    const limit = wide ? CHIPS_MAX : DOTS_MAX;
    const hidden = events.length - limit;

    return (
      <>
        {wide ? (
          <MonthPlannerChips>
            {events.slice(0, limit).map((event) => (
              <MonthPlannerChip
                key={event.id}
                hue={childHue(family, event.childId)}
                done={event.done}
              >
                {event.title}
              </MonthPlannerChip>
            ))}
          </MonthPlannerChips>
        ) : (
          <MonthPlannerDots>
            {events.slice(0, limit).map((event) => (
              <HueDot key={event.id} hue={childHue(family, event.childId)} />
            ))}
          </MonthPlannerDots>
        )}
        {hidden > 0 && (
          <MonthPlannerMore aria-hidden>{t("calendar.hidden", { count: hidden })}</MonthPlannerMore>
        )}
      </>
    );
  };

  const labelOf = (date: Date) => {
    const day = byDate.get(isoDay(date));
    const label = {
      day: wallDateLabel(isoDay(date), today),
      count: day?.events.length ?? 0,
    };

    return day && isCrunchDay(day.date, day.events, today)
      ? t("calendar.dayCrunch", label)
      : t("calendar.day", label);
  };

  return (
    <div className="flex flex-col gap-6">
      <MonthPlanner
        selected={localDay(anchor)}
        onSelect={(date) => onSelect(isoDay(date))}
        month={localDay(`${shown.month}-01`)}
        onMonthChange={(month) => {
          setShown((current) => ({ ...current, month: isoDay(month).slice(0, 7) }));
          onSelect(isoDay(month));
        }}
        today={localDay(today)}
        modifiers={{ crunch }}
        labels={{ labelDayButton: labelOf }}
        dayContent={dayContent}
      />
      {emptyPeriod ?? (
        <CalendarDaySection day={selected} family={family} now={now} today={today} onAdd={onAdd} />
      )}
    </div>
  );
}
