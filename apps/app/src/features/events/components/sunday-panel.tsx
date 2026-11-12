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
import { TextLink } from "@packages/ui/components/ui/text-link";
import { TypographyH3, TypographyMuted } from "@packages/ui/components/ui/typography";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../../shared/events/event-labels";
import { EventLink } from "../../../shared/events/event-link";
import { childHue, childLabelOf } from "../../../shared/format/child-hue";
import { deadlineLabel } from "../../../shared/format/deadline-label";
import { SIGN_ITEMS, useChecklists } from "../hooks/use-checklist";
import type { WeekDay } from "../week";
import { WeekShareButton } from "./week-share-button";

const LIST_FORMAT = new Intl.ListFormat("fr-FR", { type: "conjunction" });

export interface SundayPanelProps {
  days: readonly WeekDay[];
  family: readonly ChildDto[];
  now: Date;
}

export function SundayPanel({ days, family, now }: SundayPanelProps) {
  const { t } = useTranslation("events");
  const titleId = useId();
  const signId = useId();
  const prepareId = useId();
  const events = days.flatMap((day) => day.events);
  const byChild = family
    .map((child) => ({ child, events: events.filter((event) => event.childId === child.id) }))
    .filter((group) => group.events.length > 0);

  const checklists = useChecklists(events);
  const pending = events.map((event, index) => ({
    event,
    items: (checklists[index] ?? []).filter((item) => !item.done),
  }));
  const toSign = pending.filter(({ items }) => items.some((item) => SIGN_ITEMS.includes(item.id)));
  const toPrepare = pending
    .map(({ event, items }) => ({
      event,
      items: items.filter((item) => !SIGN_ITEMS.includes(item.id)),
    }))
    .filter(({ items }) => items.length > 0);
  const eventLine = (event: EventItem) =>
    t("week.shareItem", { child: childLabelOf(family, event.childId), title: event.title });

  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id={titleId}>{t("sunday.title")}</h2>
          </CardTitle>
          <CardDescription>{t("sunday.description")}</CardDescription>
          <CardAction>
            <WeekShareButton days={days} family={family} now={now} />
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
          {toSign.length > 0 && (
            <section aria-labelledby={signId} className="flex flex-col gap-2">
              <TypographyH3 id={signId}>{t("sunday.toSign")}</TypographyH3>
              <ul className="flex flex-col gap-1">
                {toSign.map(({ event }) => (
                  <li key={event.id}>
                    <TextLink asChild>
                      <EventLink eventId={event.id}>{eventLine(event)}</EventLink>
                    </TextLink>
                    <TypographyMuted>
                      {deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
                    </TypographyMuted>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {toPrepare.length > 0 && (
            <section aria-labelledby={prepareId} className="flex flex-col gap-2">
              <TypographyH3 id={prepareId}>{t("sunday.toPrepare")}</TypographyH3>
              <ul className="flex flex-col gap-1">
                {toPrepare.map(({ event, items }) => (
                  <li key={event.id}>
                    <TextLink asChild>
                      <EventLink eventId={event.id}>{eventLine(event)}</EventLink>
                    </TextLink>
                    <TypographyMuted>
                      {LIST_FORMAT.format(items.map((item) => item.label))}
                    </TypographyMuted>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
