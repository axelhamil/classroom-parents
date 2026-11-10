import type { EventReminders } from "./api/events.queries";

type ReminderStatus = EventReminders["reminders"][number]["status"];

export const REMINDER_STATUS_LABEL_KEYS = {
  pending: "reminders.statuses.pending",
  sent: "reminders.statuses.sent",
  skipped: "reminders.statuses.skipped",
  missed: "reminders.statuses.missed",
  unplanned: "reminders.statuses.unplanned",
} as const satisfies Record<ReminderStatus, string>;
