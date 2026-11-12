import { Badge } from "@packages/ui/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@packages/ui/components/ui/card";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import {
  PlannerSticker,
  PlannerStickerMeta,
  PlannerStickerTitle,
} from "@packages/ui/components/ui/planner-sticker";
import { TypographyH3, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../../shared/events/event-labels";
import { EventLink } from "../../../shared/events/event-link";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { dayLabel, deadlineLabel } from "../../../shared/format/deadline-label";
import type { WeekDay } from "../week";
import { ShareButton } from "./share-button";

export interface SundayPanelProps {
  days: readonly WeekDay[];
  family: readonly ChildDto[];
  now: Date;
}

export function SundayPanel({ days, family, now }: SundayPanelProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const events = days.flatMap((day) => day.events);
  const byChild = family
    .map((child) => ({ child, events: events.filter((event) => event.childId === child.id) }))
    .filter((group) => group.events.length > 0);

  const itemLine = (event: EventItem) =>
    t("week.shareItem", {
      child: childLabelOf(family, event.childId),
      title: event.title,
    });

  const shareText = () => ({
    title: t("week.shareTitle"),
    text:
      events.length === 0
        ? t("week.shareNothing")
        : days
            .filter((day) => day.events.length > 0)
            .map((day) =>
              [
                t("week.shareDay", { day: dayLabel(day.date, now) }),
                ...day.events.map((event) => itemLine(event)),
              ].join("\n"),
            )
            .join("\n\n"),
  });

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id={titleId}>{t("sunday.title")}</h2>
          </CardTitle>
          <CardDescription>{t("sunday.description")}</CardDescription>
          <CardAction>
            <ShareButton label={t("week.share")} payload={shareText} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {byChild.length === 0 && <TypographyMuted>{t("week.shareNothing")}</TypographyMuted>}
          {byChild.map(({ child, events: childEvents }) => {
            const hue = childHue(family, child.id);

            return (
              <div key={child.id} className="flex flex-col gap-2">
                <TypographyH3 className="flex items-center gap-2">
                  <ChildAvatar name={child.label} tone={hue} size="sm" />
                  <span className="min-w-0 truncate">{child.label}</span>
                  <Badge variant="soon">{t("sunday.count", { count: childEvents.length })}</Badge>
                </TypographyH3>
                <ul className="grid gap-2 @md:grid-cols-2">
                  {childEvents.map((event) => {
                    const CategoryIcon = CATEGORY_ICONS[event.category];

                    return (
                      <li key={event.id} className="flex">
                        <PlannerSticker asChild hue={hue}>
                          <EventLink eventId={event.id}>
                            <PlannerStickerTitle>{event.title}</PlannerStickerTitle>
                            <PlannerStickerMeta>
                              <CategoryIcon aria-hidden />
                              {t(CATEGORY_LABEL_KEYS[event.category])}
                              <span>
                                {deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
                              </span>
                            </PlannerStickerMeta>
                          </EventLink>
                        </PlannerSticker>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
