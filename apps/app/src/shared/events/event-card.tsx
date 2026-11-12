import { withWallTime } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DateTab } from "@packages/ui/components/ui/date-tab";
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
import { CATEGORY_BADGE_VARIANTS, CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "./event-labels";
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

export interface DeadlineWhenProps {
  countdown: Countdown;
  label: string;
  deadlineTime: string | undefined;
}

export function DeadlineWhen({ countdown, label, deadlineTime }: DeadlineWhenProps) {
  const { t } = useTranslation("events");
  if (countdown === null) return label;

  if (countdown.kind === "soon")
    return (
      <>
        {label}
        <Badge variant="soon">{t("countdown.inDays", { count: countdown.days })}</Badge>
      </>
    );

  return (
    <Badge key={countdown.kind} variant="urgent">
      <AlarmClockIcon aria-hidden />
      {countdownLabel(countdown.kind, label, deadlineTime, t)}
    </Badge>
  );
}

export interface EventCardProps {
  event: EventItem;
  childLabel: string;
  hue: ChildHue;
  muted?: boolean;
}

export function EventCard({ event, childLabel, hue, muted = false }: EventCardProps) {
  const { t } = useTranslation("events");
  const now = new Date();
  const date = wallDateParts(event.deadlineDate);
  const label = deadlineLabel(event.deadlineDate, event.deadlineTime, now);
  const countdown = muted ? null : countdownOf(event.deadlineDate, event.deadlineTime, now);
  const CategoryIcon = CATEGORY_ICONS[event.category];

  return (
    <PlannerCard asChild muted={muted}>
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
            {event.status === "needs_review" && <Badge variant="review">{t("review.title")}</Badge>}
            <Badge variant={CATEGORY_BADGE_VARIANTS[event.category]}>
              <CategoryIcon aria-hidden />
              {t(CATEGORY_LABEL_KEYS[event.category])}
            </Badge>
            {childLabel && (
              <Badge hue={hue} className="max-w-full">
                <ChildAvatar name={childLabel} tone={hue} size="xs" />
                <span className="truncate">{childLabel}</span>
              </Badge>
            )}
          </PlannerCardStickers>
        </PlannerCardBody>
      </EventLink>
    </PlannerCard>
  );
}
