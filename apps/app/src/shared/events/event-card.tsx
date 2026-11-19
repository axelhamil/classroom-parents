import { withWallTime } from "@packages/i18n";
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
import type { TFunction } from "i18next";
import { AlarmClockIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EventItem } from "../api/queries/events";
import type { ChildHue } from "../format/child-hue";
import {
  type Countdown,
  type CountdownKind,
  countdownOf,
  deadlineLabel,
  wallDateParts,
} from "../format/deadline-label";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS, CATEGORY_TONES } from "./event-labels";
import { EventLink } from "./event-link";

function countdownLabel(
  kind: Exclude<CountdownKind, "soon">,
  label: string,
  deadlineTime: string | undefined,
  t: TFunction<"events">,
): string {
  if (kind === "tonight") return withWallTime(t("countdown.tonight"), deadlineTime);
  if (kind === "tomorrowMorning") return withWallTime(t("countdown.tomorrowMorning"), deadlineTime);

  return label;
}

export interface CountdownBadgeProps {
  countdown: Countdown;
  label: string;
  deadlineTime: string | undefined;
}

export function CountdownBadge({ countdown, label, deadlineTime }: CountdownBadgeProps) {
  const { t } = useTranslation("events");
  if (countdown === null) return null;

  if (countdown.kind === "soon")
    return <Badge variant="soon">{t("countdown.inDays", { count: countdown.days })}</Badge>;

  return (
    <Badge key={countdown.kind} variant="urgent">
      <AlarmClockIcon aria-hidden />
      {countdownLabel(countdown.kind, label, deadlineTime, t)}
    </Badge>
  );
}

export function withoutImminent(countdown: Countdown): Countdown {
  return countdown?.kind === "imminent" ? null : countdown;
}

function DeadlineWhen(props: CountdownBadgeProps) {
  if (props.countdown === null) return props.label;
  if (props.countdown.kind !== "soon") return <CountdownBadge {...props} />;

  return (
    <>
      {props.label}
      <CountdownBadge {...props} />
    </>
  );
}

export interface EventCardProps {
  event: EventItem;
  childLabel: string;
  hue: ChildHue;
  muted?: boolean;
  markReview?: boolean;
}

export function EventCard({
  event,
  childLabel,
  hue,
  muted = false,
  markReview = true,
}: EventCardProps) {
  const { t } = useTranslation("events");
  const now = new Date();
  const date = wallDateParts(event.deadlineDate);
  const label = deadlineLabel(event.deadlineDate, event.deadlineTime, now);
  const countdown = muted ? null : countdownOf(event.deadlineDate, event.deadlineTime, now);
  const CategoryIcon = CATEGORY_ICONS[event.category];

  return (
    <PlannerCard asChild muted={muted} hue={muted ? undefined : hue}>
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
            <DeadlineWhen countdown={countdown} label={label} deadlineTime={event.deadlineTime} />
          </PlannerCardMeta>
          <PlannerCardStickers>
            {markReview && event.status === "needs_review" && (
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
