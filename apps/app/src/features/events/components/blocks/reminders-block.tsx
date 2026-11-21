import { AlertsOffIcon, AlertsOnIcon } from "@packages/ui/components/ui/icons";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@packages/ui/components/ui/item";
import { useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { watchedForReminders } from "../../../../shared/agenda/views";
import { nextSevenDays } from "../../../../shared/agenda/windows";
import type { EventItem } from "../../../../shared/api/queries/events";
import { useTileSizeClass } from "../../../../shared/dashboard/tile-size-class";
import { EventLink } from "../../../../shared/events/event-link";
import { instantLabel } from "../../../../shared/format/deadline-label";
import { type EventReminders, eventRemindersQueryOptions } from "../../api/events.queries";
import type { HomeBlockDefinition, HomeBlockProps } from "../../home-block";
import { useHomeEvents } from "../../hooks/use-home-events";
import { BlockEmpty } from "./block-empty";
import { BlockGlance } from "./block-glance";
import { BlockPanel } from "./block-panel";

interface Ringing {
  key: string;
  event: EventItem;
  dueAt: string;
}

function ringingOf(event: EventItem, reply: EventReminders | undefined, now: Date): Ringing[] {
  return (reply?.reminders ?? []).flatMap(({ dueAt, status }) =>
    dueAt && status === "pending" && new Date(dueAt) > now
      ? [{ key: `${event.id}:${dueAt}`, event, dueAt }]
      : [],
  );
}

function RemindersBlock({ childId, clock, title }: HomeBlockProps) {
  const { t } = useTranslation("home");
  const { now } = clock;
  const calendar = useHomeEvents(clock);
  const watched = watchedForReminders(calendar.data ?? [], clock, childId);
  const replies = useQueries({
    queries: watched.map((event) => eventRemindersQueryOptions(event.id)),
  });
  const settled = calendar.isSuccess && replies.every((reply) => !reply.isPending);
  const ringing = watched
    .flatMap((event, index) => ringingOf(event, replies[index]?.data, now))
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const [nearest] = ringing;
  const glance = useTileSizeClass() === "glance";

  return (
    <BlockPanel title={title} icon={AlertsOnIcon} fits={glance}>
      {settled && ringing.length === 0 && (
        <BlockEmpty
          icon={AlertsOffIcon}
          title={t("blocks.reminders.empty", { days: nextSevenDays.days })}
          hint={t("blocks.reminders.emptyHint")}
        />
      )}
      {nearest && glance && (
        <BlockGlance
          events={ringing.map(({ event }) => event)}
          label={(count) => t("blocks.reminders.count", { count })}
          today={clock.today}
          when={instantLabel(nearest.dueAt, clock)}
        />
      )}
      {ringing.length > 0 && !glance && (
        <ul className="flex flex-col gap-2">
          {ringing.map(({ key, event, dueAt }) => (
            <Item key={key} asChild variant="outline" size="sm">
              <li>
                <ItemContent>
                  <ItemTitle>
                    <EventLink eventId={event.id}>{event.title}</EventLink>
                  </ItemTitle>
                  <ItemDescription>{instantLabel(dueAt, clock)}</ItemDescription>
                </ItemContent>
              </li>
            </Item>
          ))}
        </ul>
      )}
    </BlockPanel>
  );
}

export const remindersBlock: HomeBlockDefinition = {
  id: "reminders",
  titleKey: "blocks.reminders.title",
  descriptionKey: "blocks.reminders.description",
  windowDays: nextSevenDays.days,
  icon: AlertsOnIcon,
  Component: RemindersBlock,
};
