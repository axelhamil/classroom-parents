import { relativeDayLabel, wallTimeLabel } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import { ReminderIcon } from "@packages/ui/components/ui/icons";
import { useTranslation } from "react-i18next";
import type { SchoolClock } from "./school-clock";
import type { When, WhenBadge } from "./when";

function useBadgeText(): (badge: WhenBadge) => string {
  const { t } = useTranslation("events");
  const { t: tCommon } = useTranslation("common");

  return (badge) => {
    switch (badge.kind) {
      case "tonight":
        return t("countdown.tonight");
      case "tomorrowMorning":
        return t("countdown.tomorrowMorning");
      case "today":
        return tCommon("deadline.today");
      case "tomorrow":
        return tCommon("deadline.tomorrow");
      case "inDays":
        return t("countdown.inDays", { count: badge.days });
    }
  };
}

export interface WhenBadgeViewProps {
  badge: WhenBadge | null;
}

export function WhenBadgeView({ badge }: WhenBadgeViewProps) {
  const badgeText = useBadgeText();
  if (badge === null) return null;

  if (badge.tone === "soon") return <Badge variant="soon">{badgeText(badge)}</Badge>;

  return (
    <Badge variant="urgent">
      <ReminderIcon aria-hidden />
      {badgeText(badge)}
    </Badge>
  );
}

export interface WhenMetaProps {
  when: When;
  clock: SchoolClock;
}

/** Writes a deadline's `When` as meta items: the urgent word or the date, then the time, once each. */
export function WhenMeta({ when, clock }: WhenMetaProps) {
  const urgent = when.badge?.tone === "urgent" ? when.badge : null;
  const soon = when.badge?.tone === "soon" ? when.badge : null;

  return (
    <>
      <WhenBadgeView badge={urgent} />
      {when.date && <span>{relativeDayLabel(when.date, clock.today)}</span>}
      {when.time && <span>{wallTimeLabel(when.time)}</span>}
      <WhenBadgeView badge={soon} />
    </>
  );
}
