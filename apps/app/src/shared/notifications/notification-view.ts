import { deadlineLine, type frCatalog } from "@packages/i18n";
import {
  ConfirmDateIcon,
  DeadlineCancelledIcon,
  DeadlineMovedIcon,
  type Icon,
  NewDeadlinesIcon,
  ReminderIcon,
  SchoolIcon,
  UnlinkIcon,
  WeeklyDigestIcon,
} from "@packages/ui/components/ui/icons";
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
  icon: Icon;
}

type Kind = NotificationContent["kind"];

type ContentOf<K extends Kind> = Extract<NotificationContent, { kind: K }>;

const HOME: NotificationTarget = { to: "/" };

const CHILDREN: NotificationTarget = { to: "/children" };

function eventTarget(eventId: string): NotificationTarget {
  return { to: "/events/$eventId", params: { eventId } };
}

interface NamedDeadline {
  title: string | undefined;
  child: string | null;
}

function titled(
  { title, child }: NamedDeadline,
  key: ItemKey,
  untitledKey: ItemKey,
): NotificationCopy {
  if (title === undefined) return { key: `items.${untitledKey}`, values: {} };

  return {
    key: `items.${key}`,
    values: { line: deadlineLine({ child: child ?? undefined, title }) },
  };
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

function amended(content: ContentOf<"deadline_amended">, deadline: NamedDeadline) {
  const cancelled = content.reason === "cancelled";

  return {
    copy: cancelled
      ? titled(deadline, "deadlineCancelled", "deadlineCancelledUntitled")
      : titled(deadline, "deadlineMoved", "deadlineMovedUntitled"),
    target: eventTarget(content.eventId),
    icon: cancelled ? DeadlineCancelledIcon : DeadlineMovedIcon,
  };
}

function datesToCheck(content: ContentOf<"dates_to_check">, child: string | null) {
  const [only, ...others] = content.eventIds;
  const count = content.eventIds.length;

  return {
    copy: named(child, "datesToCheck", "datesToCheckUnnamed", { count }),
    target: only !== undefined && others.length === 0 ? eventTarget(only) : HOME,
    icon: ConfirmDateIcon,
  };
}

export function notificationView(
  { content, event }: Pick<NotificationItem, "content" | "event">,
  child: string | null,
): NotificationView {
  const deadline = { title: event?.title, child };

  switch (content.kind) {
    case "deadline_reminder":
      return {
        copy: titled(deadline, "deadlineReminder", "deadlineReminderUntitled"),
        target: eventTarget(content.eventId),
        icon: ReminderIcon,
      };
    case "deadline_reminders":
      return {
        copy: { key: "items.deadlineReminders", values: { count: content.count } },
        target: HOME,
        icon: ReminderIcon,
      };
    case "weekly_digest":
      return {
        copy: { key: "items.weeklyDigest", values: { count: content.deadlines } },
        target: HOME,
        icon: WeeklyDigestIcon,
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
        icon: NewDeadlinesIcon,
      };
    case "deadline_amended":
      return amended(content, deadline);
    case "dates_to_check":
      return datesToCheck(content, child);
  }
}
