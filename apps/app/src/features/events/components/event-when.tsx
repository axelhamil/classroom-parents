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
import { isOverdue, needsReview } from "../../../shared/agenda/deadline-facts";
import { useSchoolClock } from "../../../shared/agenda/school-clock-context";
import { whenOf } from "../../../shared/agenda/when";
import { WhenBadgeView } from "../../../shared/agenda/when-meta";
import { childrenQueryOptions } from "../../../shared/api/queries/children";
import type { EventItem } from "../../../shared/api/queries/events";
import { childAvatarSrc } from "../../../shared/children/child-avatar-src";
import {
  CATEGORY_ICONS,
  CATEGORY_LABEL_KEYS,
  CATEGORY_TONES,
  ORIGIN_LABEL_KEYS,
} from "../../../shared/events/event-labels";
import { type ChildHue, childHue } from "../../../shared/format/child-hue";
import {
  capitalize,
  dayLabelFrom,
  daysUntil,
  wallDateParts,
} from "../../../shared/format/deadline-label";
import { schoolToday } from "../../../shared/format/school-today";

export interface EventWhenProps {
  event: EventItem;
  hue: ChildHue;
}

export function EventWhen({ event, hue }: EventWhenProps) {
  const { t } = useTranslation("events");
  const clock = useSchoolClock();
  const when = whenOf(event, clock, { dated: false });
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
        <DeadlineHeroDay>{dayLabelFrom(event.deadlineDate, clock.today)}</DeadlineHeroDay>
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
          {isOverdue(event, clock.today) && (
            <Badge variant="destructive">{t("calendar.overdue")}</Badge>
          )}
          <WhenBadgeView badge={when.badge} />
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
      {needsReview(event) && <Badge variant="review">{t("review.title")}</Badge>}
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
