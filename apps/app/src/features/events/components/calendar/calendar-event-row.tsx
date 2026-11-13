import { wallTimeLabel } from "@packages/i18n";
import { Badge } from "@packages/ui/components/ui/badge";
import {
  CalendarEntry,
  CalendarEntryBody,
  CalendarEntryLink,
  CalendarEntryMeta,
} from "@packages/ui/components/ui/calendar-entry";
import { Checkbox } from "@packages/ui/components/ui/checkbox";
import { ChildAvatar } from "@packages/ui/components/ui/child-avatar";
import { useTranslation } from "react-i18next";
import type { ChildDto } from "../../../../shared/api/queries/children";
import type { EventItem } from "../../../../shared/api/queries/events";
import { CATEGORY_ICONS, CATEGORY_LABEL_KEYS } from "../../../../shared/events/event-labels";
import { EventLink } from "../../../../shared/events/event-link";
import { childHue, childLabelOf } from "../../../../shared/format/child-hue";
import { countdownOf, dayLabel } from "../../../../shared/format/deadline-label";
import { isOverdue } from "../../calendar";
import { useToggleDone } from "../../hooks/use-toggle-done";

export interface CalendarEventRowProps {
  event: EventItem;
  family: readonly ChildDto[];
  now: Date;
  today: string;
  density?: "row" | "sticker";
  dated?: boolean;
  withChild?: boolean;
}

function stateOf(event: EventItem, now: Date, today: string) {
  if (event.done) return "done";
  if (isOverdue(event, today)) return "overdue";
  const countdown = countdownOf(event.deadlineDate, event.deadlineTime, now);

  return countdown && countdown.kind !== "soon" ? "urgent" : "open";
}

export function CalendarEventRow({
  event,
  family,
  now,
  today,
  density = "row",
  dated = false,
  withChild = true,
}: CalendarEventRowProps) {
  const { t } = useTranslation("events");
  const toggle = useToggleDone();
  const CategoryIcon = CATEGORY_ICONS[event.category];
  const hue = childHue(family, event.childId);
  const childLabel = withChild && family.length > 1 ? childLabelOf(family, event.childId) : "";
  const state = stateOf(event, now, today);

  return (
    <CalendarEntry hue={hue} density={density} state={state}>
      <Checkbox
        checked={event.done}
        onCheckedChange={(checked) => toggle.mutate({ eventId: event.id, done: checked === true })}
        aria-label={t("calendar.markDone", { title: event.title })}
      />
      <CalendarEntryBody>
        <CalendarEntryLink asChild>
          <EventLink eventId={event.id}>{event.title}</EventLink>
        </CalendarEntryLink>
        <CalendarEntryMeta>
          <CategoryIcon aria-hidden />
          <span>{t(CATEGORY_LABEL_KEYS[event.category])}</span>
          {dated && <span>{dayLabel(event.deadlineDate, now)}</span>}
          {event.deadlineTime && <span>{wallTimeLabel(event.deadlineTime)}</span>}
          {childLabel && (
            <span className="flex min-w-0 items-center gap-1">
              <ChildAvatar name={childLabel} tone={hue} size="xs" />
              <span className="truncate">{childLabel}</span>
            </span>
          )}
          {state === "overdue" && <Badge variant="destructive">{t("calendar.overdue")}</Badge>}
        </CalendarEntryMeta>
      </CalendarEntryBody>
    </CalendarEntry>
  );
}
