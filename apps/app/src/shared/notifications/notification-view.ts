import type { frCatalog } from "@packages/i18n";
import {
  AlarmClockIcon,
  CalendarClockIcon,
  CalendarPlusIcon,
  CalendarRangeIcon,
  CalendarSearchIcon,
  CalendarXIcon,
  type LucideIcon,
  SchoolIcon,
  UnlinkIcon,
} from "lucide-react";
import type { NotificationContent, NotificationItem } from "./notifications.queries";

type PluralBase<Key> = Key extends `${infer Base}_${"one" | "other"}` ? Base : Key;

type ItemKey = PluralBase<keyof typeof frCatalog.notifications.items>;

export interface NotificationCopy {
  key: `items.${ItemKey}`;
  values: Record<string, string | number>;
}

export type NotificationTarget =
  | { to: "/" }
  | { to: "/children" }
  | { to: "/events/$eventId"; params: { eventId: string } };

export interface NotificationView {
  copy: NotificationCopy;
  target: NotificationTarget;
  icon: LucideIcon;
}

type Kind = NotificationContent["kind"];

type ContentOf<K extends Kind> = Extract<NotificationContent, { kind: K }>;

const HOME: NotificationTarget = { to: "/" };

const CHILDREN: NotificationTarget = { to: "/children" };

function eventTarget(eventId: string): NotificationTarget {
  return { to: "/events/$eventId", params: { eventId } };
}

function titled(title: string | undefined, key: ItemKey, untitledKey: ItemKey): NotificationCopy {
  if (title === undefined) return { key: `items.${untitledKey}`, values: {} };

  return { key: `items.${key}`, values: { title } };
}

function named(
  child: string | null,
  key: ItemKey,
  unnamedKey: ItemKey,
  values: Record<string, number> = {},
): NotificationCopy {
  if (child === null) return { key: `items.${unnamedKey}`, values };

  return { key: `items.${key}`, values: { ...values, child } };
}

function amended(content: ContentOf<"deadline_amended">, title: string | undefined) {
  const cancelled = content.reason === "cancelled";

  return {
    copy: cancelled
      ? titled(title, "deadlineCancelled", "deadlineCancelledUntitled")
      : titled(title, "deadlineMoved", "deadlineMovedUntitled"),
    target: eventTarget(content.eventId),
    icon: cancelled ? CalendarXIcon : CalendarClockIcon,
  };
}

function datesToCheck(content: ContentOf<"dates_to_check">, child: string | null) {
  const [only, ...others] = content.eventIds;
  const count = content.eventIds.length;

  return {
    copy: named(child, "datesToCheck", "datesToCheckUnnamed", { count }),
    target: only !== undefined && others.length === 0 ? eventTarget(only) : HOME,
    icon: CalendarSearchIcon,
  };
}

export function notificationView(
  { content, event }: Pick<NotificationItem, "content" | "event">,
  child: string | null,
): NotificationView {
  const title = event?.title;

  switch (content.kind) {
    case "deadline_reminder":
      return {
        copy: titled(title, "deadlineReminder", "deadlineReminderUntitled"),
        target: eventTarget(content.eventId),
        icon: AlarmClockIcon,
      };
    case "deadline_reminders":
      return {
        copy: { key: "items.deadlineReminders", values: { count: content.count } },
        target: HOME,
        icon: AlarmClockIcon,
      };
    case "weekly_digest":
      return {
        copy: { key: "items.weeklyDigest", values: { count: content.deadlines } },
        target: HOME,
        icon: CalendarRangeIcon,
      };
    case "access_lost":
      return {
        copy: named(child, "accessLost", "accessLostUnnamed"),
        target: CHILDREN,
        icon: UnlinkIcon,
      };
    case "school_allowed":
      return {
        copy: named(child, "schoolAllowed", "schoolAllowedUnnamed"),
        target: CHILDREN,
        icon: SchoolIcon,
      };
    case "new_deadlines":
      return {
        copy: named(child, "newDeadlines", "newDeadlinesUnnamed", { count: content.count }),
        target: HOME,
        icon: CalendarPlusIcon,
      };
    case "deadline_amended":
      return amended(content, title);
    case "dates_to_check":
      return datesToCheck(content, child);
  }
}
