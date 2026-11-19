import { wallDateLabel, wallTimeLabel } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import {
  DeadlineCategory,
  DeadlineEyebrow,
  DeadlineHero,
  DeadlineHeroBody,
  DeadlineHeroDate,
  DeadlineHeroDay,
  DeadlineHeroMeta,
  DeadlineOrigin,
} from "@packages/ui/components/ui/deadline-sheet";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { CheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { childrenQueryOptions } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import { CountdownBadge, withoutImminent } from "../../../shared/events/event-card";
import {
  CATEGORY_ICONS,
  CATEGORY_LABEL_KEYS,
  CATEGORY_TONES,
  ORIGIN_LABEL_KEYS,
} from "../../../shared/events/event-labels";
import { type ChildHue, childHue } from "../../../shared/format/child-hue";
import {
  capitalize,
  countdownOf,
  dayLabel,
  daysUntil,
  deadlineLabel,
  wallDateParts,
} from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";

export interface EventWhenProps {
  event: EventItem;
  hue: ChildHue;
  now: Date;
}

export function EventWhen({ event, hue, now }: EventWhenProps) {
  const { t } = useTranslation("events");
  const overdue = !event.done && event.deadlineDate < schoolToday(now);
  const countdown = event.done ? null : countdownOf(event.deadlineDate, event.deadlineTime, now);
  const date = wallDateParts(event.deadlineDate);

  return (
    <DeadlineHero data-tour="event-detail-when">
      <DateTab
        size="lg"
        dateTime={event.deadlineDate}
        tone={event.done ? "muted" : "default"}
        hue={event.done ? undefined : hue}
        day={date.day}
        month={date.month}
        weekday={date.weekday}
        aria-hidden
      />
      <DeadlineHeroBody>
        <DeadlineHeroDay>{dayLabel(event.deadlineDate, now)}</DeadlineHeroDay>
        {event.deadlineTime && (
          <DeadlineHeroDate>{wallTimeLabel(event.deadlineTime)}</DeadlineHeroDate>
        )}
        <DeadlineHeroMeta>
          {event.done && (
            <Badge variant="secondary">
              <CheckIcon aria-hidden />
              {t("detail.isDone")}
            </Badge>
          )}
          {overdue && <Badge variant="destructive">{t("calendar.overdue")}</Badge>}
          <CountdownBadge
            countdown={withoutImminent(countdown)}
            label={deadlineLabel(event.deadlineDate, event.deadlineTime, now)}
            deadlineTime={event.deadlineTime}
          />
        </DeadlineHeroMeta>
      </DeadlineHeroBody>
    </DeadlineHero>
  );
}

export interface EventEyebrowProps {
  event: Pick<EventItem, "category" | "status">;
}

export function EventEyebrow({ event }: EventEyebrowProps) {
  const { t } = useTranslation("events");
  const CategoryIcon = CATEGORY_ICONS[event.category];

  return (
    <DeadlineEyebrow>
      <DeadlineCategory tone={CATEGORY_TONES[event.category]}>
        <CategoryIcon aria-hidden />
        {t(CATEGORY_LABEL_KEYS[event.category])}
      </DeadlineCategory>
      {event.status === "needs_review" && <Badge variant="review">{t("review.title")}</Badge>}
    </DeadlineEyebrow>
  );
}

function receivedWhen(receivedAt: string, now: Date, t: TFunction<"events">): string {
  const day = schoolToday(new Date(receivedAt));
  const daysAgo = -daysUntil(day, now);
  if (daysAgo === 0) return t("detail.receivedToday");
  if (daysAgo === 1) return t("detail.receivedYesterday");

  return t("detail.receivedOn", { date: wallDateLabel(day, schoolToday(now)) });
}

export interface EventOriginProps {
  event: Pick<EventItem, "childId" | "course" | "source" | "receivedAt">;
}

export function EventOrigin({ event }: EventOriginProps) {
  const { t } = useTranslation("events");
  const family = useQuery(childrenQueryOptions).data ?? [];
  const child = family.find((candidate) => candidate.id === event.childId);
  const received = t(ORIGIN_LABEL_KEYS[event.source], {
    when: receivedWhen(event.receivedAt, new Date(), t),
  });
  const origin = event.course
    ? t("detail.originOf", { who: event.course.name, origin: received })
    : received;

  return (
    <DeadlineOrigin>
      {child && (
        <ChildAvatar
          name={child.label}
          tone={childHue(family, child.id)}
          src={childAvatarSrc(child)}
          size="xs"
        />
      )}
      <span>{child ? t("detail.originOf", { who: child.label, origin }) : capitalize(origin)}</span>
    </DeadlineOrigin>
  );
}
