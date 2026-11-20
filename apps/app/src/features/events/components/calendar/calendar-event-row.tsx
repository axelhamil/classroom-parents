import { Badge } from "@packages/ui/components/ui/badge";
import {
  CalendarEntry,
  CalendarEntryBody,
  CalendarEntryLink,
  CalendarEntryMeta,
} from "@packages/ui/components/ui/calendar-entry";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { DeadlineCategory } from "@packages/ui/components/ui/deadline-sheet";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { isOverdue, needsReview } from "../../../../shared/agenda/deadline-facts";
import type { SchoolClock } from "../../../../shared/agenda/school-clock";
import { useSchoolClock } from "../../../../shared/agenda/school-clock-context";
import { whenOf } from "../../../../shared/agenda/when";
import { WhenMeta } from "../../../../shared/agenda/when-meta";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import {
  CATEGORY_LABEL_KEYS,
  CATEGORY_TONES,
  categoryIcon,
} from "../../../../shared/events/event-labels";
import { EventLink } from "../../../../shared/events/event-link";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { useToggleDone } from "../../hooks/use-toggle-done";

export interface CalendarEventRowProps {
  event: EventItem;
  family: readonly ChildDto[];
  dated?: boolean;
  withChild?: boolean;
  compact?: boolean;
  withCountdown?: boolean;
  courseName?: string;
  surface?: "tint" | "paper";
  withCategoryWord?: boolean;
  children?: ReactNode;
}

function stateOf(event: EventItem, clock: SchoolClock) {
  if (event.done) return "done";
  if (isOverdue(event, clock.today)) return "overdue";

  return whenOf(event, clock, { dated: true }).badge?.tone === "urgent" ? "urgent" : "open";
}

export function CalendarEventRow({
  event,
  family,
  dated = false,
  withChild = true,
  compact = false,
  withCountdown = false,
  courseName,
  surface = "tint",
  withCategoryWord = !compact,
  children,
}: CalendarEventRowProps) {
  const { t } = useTranslation("events");
  const toggle = useToggleDone();
  const clock = useSchoolClock();
  const CategoryIcon = categoryIcon(event.category);
  const hue = childHue(family, event.childId);
  const childLabel = withChild && family.length > 1 ? childLabelOf(family, event.childId) : "";
  const status = stateOf(event, clock);
  const state = compact && status === "overdue" ? "open" : status;
  const when = whenOf(event, clock, {
    dated,
    withBadge: withCountdown && (state === "open" || state === "urgent"),
  });

  return (
    <CalendarEntry
      hue={hue}
      surface={surface}
      state={state}
      density={compact ? "compact" : "comfortable"}
    >
      <Checkbox
        tone={hue}
        checked={event.done}
        onCheckedChange={(checked) => toggle.mutate({ eventId: event.id, done: checked === true })}
        aria-label={t("calendar.markDone", { title: event.title })}
      />
      <CalendarEntryBody>
        <CalendarEntryLink asChild>
          <EventLink eventId={event.id}>{event.title}</EventLink>
        </CalendarEntryLink>
        <CalendarEntryMeta>
          <DeadlineCategory tone={CATEGORY_TONES[event.category]} size="xs">
            <CategoryIcon aria-hidden />
            <span className={withCategoryWord ? undefined : "sr-only"}>
              {t(CATEGORY_LABEL_KEYS[event.category])}
            </span>
          </DeadlineCategory>
          {courseName && <span>{courseName}</span>}
          <WhenMeta when={when} clock={clock} />
          {childLabel && (
            <span className="flex min-w-0 items-center gap-1">
              <ChildAvatar name={childLabel} tone={hue} size="xs" />
              <span className="truncate">{childLabel}</span>
            </span>
          )}
          {state === "overdue" && <Badge variant="destructive">{t("calendar.overdue")}</Badge>}
          {needsReview(event) && <Badge variant="review">{t("review.title")}</Badge>}
        </CalendarEntryMeta>
        {children}
      </CalendarEntryBody>
    </CalendarEntry>
  );
}
