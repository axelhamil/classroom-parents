import { wallTimeLabel } from "@packages/i18n";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { HueDot } from "@packages/ui/components/ui/hue-dot";
import {
  PlannerSticker,
  PlannerStickerMeta,
  PlannerStickerTitle,
} from "@packages/ui/components/ui/planner-sticker";
import { ToggleGroup, ToggleGroupItem } from "@packages/ui/components/ui/toggle-group";
import { TypographyH2, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import { EventCard } from "../../../shared/events/event-card";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../../shared/events/event-labels";
import { EventLink } from "../../../shared/events/event-link";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { countdownOf, dayLabel, wallDateParts } from "../../../shared/format/deadline-label";
import { useMediaQuery, WIDE_QUERY } from "../../../shared/layout/use-media-query";
import type { WeekDay } from "../week";

export interface WeekViewProps {
  days: readonly WeekDay[];
  family: readonly ChildDto[];
  now: Date;
}

export function WeekView(props: WeekViewProps) {
  const wide = useMediaQuery(WIDE_QUERY);

  return wide ? <WeekColumns {...props} /> : <WeekStrip {...props} />;
}

function childrenOf(day: WeekDay, family: readonly ChildDto[]): ChildDto[] {
  return family.filter((child) => day.events.some((event) => event.childId === child.id));
}

function WeekStrip({ days, family, now }: WeekViewProps) {
  const { t } = useTranslation("events");
  const [selected, setSelected] = useState(days[0]?.date ?? "");
  const day = days.find((candidate) => candidate.date === selected) ?? days[0];

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup
        type="single"
        variant="day"
        size="day"
        spacing={1}
        aria-label={t("week.days")}
        value={day?.date}
        onValueChange={(next) => next && setSelected(next)}
        className="grid w-full grid-cols-7"
      >
        {days.map((candidate) => {
          const parts = wallDateParts(candidate.date);

          return (
            <ToggleGroupItem
              key={candidate.date}
              value={candidate.date}
              aria-label={t("week.day", {
                day: dayLabel(candidate.date, now),
                count: candidate.events.length,
              })}
            >
              <span data-part="weekday">{parts.weekday}</span>
              <span data-part="day">{parts.day}</span>
              <span data-part="dots">
                {childrenOf(candidate, family).map((child) => (
                  <HueDot key={child.id} hue={childHue(family, child.id)} />
                ))}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      {day && (
        <section key={day.date} data-slot="week-day" className="flex flex-col gap-3">
          <TypographyH2 variant="section">{dayLabel(day.date, now)}</TypographyH2>
          {day.events.length === 0 ? (
            <TypographyMuted>{t("week.empty")}</TypographyMuted>
          ) : (
            <ul className="flex flex-col gap-3">
              {day.events.map((event) => (
                <li key={event.id}>
                  <EventCard
                    event={event}
                    childLabel={family.length > 1 ? childLabelOf(family, event.childId) : ""}
                    hue={childHue(family, event.childId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function WeekColumns({ days, family, now }: WeekViewProps) {
  const { t } = useTranslation("events");

  return (
    <div className="grid grid-cols-7 items-start gap-2">
      {days.map((day, index) => {
        const parts = wallDateParts(day.date);
        const label = dayLabel(day.date, now);

        return (
          <section
            key={day.date}
            data-slot="week-day"
            aria-label={t("week.day", { day: label, count: day.events.length })}
            className="flex min-w-0 flex-col items-stretch gap-2"
          >
            <DateTab
              dateTime={day.date}
              tone={index === 0 ? "today" : "default"}
              day={parts.day}
              month={parts.month}
              weekday={parts.weekday}
              aria-hidden
              className="self-center"
            />
            {day.events.map((event) => {
              const CategoryIcon = CATEGORY_ICONS[event.category];
              const hue = childHue(family, event.childId);
              const countdown = countdownOf(event.deadlineDate, event.deadlineTime, now);
              const childLabel = childLabelOf(family, event.childId);

              return (
                <PlannerSticker
                  key={event.id}
                  asChild
                  hue={hue}
                  urgent={countdown !== null && countdown.kind !== "soon"}
                >
                  <EventLink eventId={event.id}>
                    <PlannerStickerTitle>{event.title}</PlannerStickerTitle>
                    <PlannerStickerMeta>
                      <CategoryIcon aria-hidden />
                      {t(CATEGORY_LABEL_KEYS[event.category])}
                      {event.deadlineTime && <span>{wallTimeLabel(event.deadlineTime)}</span>}
                    </PlannerStickerMeta>
                    {family.length > 1 && childLabel && (
                      <PlannerStickerMeta>
                        <ChildAvatar name={childLabel} tone={hue} size="xs" />
                        <span className="truncate">{childLabel}</span>
                      </PlannerStickerMeta>
                    )}
                  </EventLink>
                </PlannerSticker>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
