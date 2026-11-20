import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
import { DeadlineCategory } from "@packages/ui/components/ui/deadline-sheet";
import {
  PlannerCard,
  PlannerCardBody,
  PlannerCardMeta,
  PlannerCardStickers,
  PlannerCardTitle,
} from "@packages/ui/components/ui/planner-card";
import { useTranslation } from "react-i18next";
import { needsReview } from "../agenda/deadline-facts";
import { useSchoolClock } from "../agenda/school-clock-context";
import { whenOf } from "../agenda/when";
import { WhenMeta } from "../agenda/when-meta";
import type { EventItem } from "../api/queries/events";
import type { ChildHue, DeadlineSurface } from "../format/child-hue";
import { wallDateParts } from "../format/deadline-label";
import { CATEGORY_LABEL_KEYS, CATEGORY_TONES, categoryIcon } from "./event-labels";
import { EventLink } from "./event-link";

export interface EventCardProps {
  event: EventItem;
  childLabel: string;
  hue: ChildHue;
  surface: DeadlineSurface;
  muted?: boolean;
  markReview?: boolean;
}

export function EventCard({
  event,
  childLabel,
  hue,
  surface,
  muted = false,
  markReview = true,
}: EventCardProps) {
  const { t } = useTranslation("events");
  const clock = useSchoolClock();
  const date = wallDateParts(event.deadlineDate);
  const when = whenOf(event, clock, { dated: true, withBadge: !muted });
  const CategoryIcon = categoryIcon(event.category);

  return (
    <PlannerCard asChild muted={muted} hue={muted ? undefined : hue} surface={surface}>
      <EventLink eventId={event.id}>
        <DateTab
          dateTime={event.deadlineDate}
          tone={muted ? "muted" : "default"}
          hue={muted ? undefined : hue}
          day={date.day}
          month={date.month}
          weekday={date.weekday}
          aria-hidden
        />
        <PlannerCardBody>
          <PlannerCardTitle>{event.title}</PlannerCardTitle>
          <PlannerCardMeta>
            <WhenMeta when={when} clock={clock} />
          </PlannerCardMeta>
          <PlannerCardStickers>
            {markReview && needsReview(event) && (
              <Badge variant="review">{t("review.title")}</Badge>
            )}
            <DeadlineCategory tone={CATEGORY_TONES[event.category]} size="xs">
              <CategoryIcon aria-hidden />
              {t(CATEGORY_LABEL_KEYS[event.category])}
            </DeadlineCategory>
            {childLabel && (
              <span className="flex min-w-0 items-center gap-1">
                <ChildAvatar name={childLabel} tone={hue} size="xs" />
                <span className="truncate">{childLabel}</span>
              </span>
            )}
          </PlannerCardStickers>
        </PlannerCardBody>
      </EventLink>
    </PlannerCard>
  );
}
