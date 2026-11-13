import { Option } from "@packages/ddd-kit";
import { z } from "zod";
import type { Alert } from "../../domain/alert.aggregate";
import type { AlertStatusValue } from "../../domain/value-objects/alert-status.vo";
import type { ReminderValue } from "../../domain/value-objects/reminder.vo";
import type { ResolvedReminder } from "../../domain/value-objects/reminder-list.vo";

const REMINDERS_BODY_MAX = 20;

export type ReminderStatus = AlertStatusValue | "unplanned";

export interface PlannedReminderDto {
  reminder: ReminderValue;
  dueAt: string | null;
  status: ReminderStatus;
  fits: boolean;
}

export interface EventRemindersDto {
  customized: boolean;
  reminders: PlannedReminderDto[];
}

export interface QuietHoursDto {
  enabled: boolean;
  start: string;
  end: string;
}

export const quietHoursBodySchema = z.strictObject({
  enabled: z.boolean(),
  start: z.string(),
  end: z.string(),
});

export interface DefaultRemindersDto {
  reminders: ReminderValue[];
}

export const eventRemindersParamSchema = z.object({ eventId: z.uuid() });

const reminderInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("days_before"), days: z.number(), time: z.string() }),
  z.strictObject({ kind: z.literal("hours_before"), hours: z.number() }),
]);

export const remindersBodySchema = z.strictObject({
  reminders: z.array(reminderInputSchema).max(REMINDERS_BODY_MAX),
});

function alertOf(
  alerts: Alert[],
  { reminder, time }: ResolvedReminder,
  deadlineAt: Date,
): Option<Alert> {
  const own = alerts.filter((alert) => alert.key() === reminder.key());
  const planned =
    own.find((alert) => alert.isPending()) ??
    own.find(
      (alert) =>
        alert.get("status").value !== "skipped" &&
        alert.get("deadlineAt").getTime() === deadlineAt.getTime(),
    );
  if (planned) return Option.some(planned);

  return time.flatMap((at) =>
    Option.fromNullable(alerts.find((alert) => alert.get("time").equals(at))),
  );
}

export interface FittingReminder extends ResolvedReminder {
  fits: boolean;
}

export function toEventRemindersDto(
  resolved: FittingReminder[],
  customized: boolean,
  alerts: Alert[],
  deadlineAt: Date,
): EventRemindersDto {
  return {
    customized,
    reminders: resolved.map((item) => {
      const alert = alertOf(alerts, item, deadlineAt);
      return {
        reminder: item.reminder.value,
        dueAt: alert
          .map((found) => found.get("time"))
          .orElse(() => item.time)
          .map((at) => at.value.at.toISOString())
          .toNull(),
        status: alert
          .map((found): ReminderStatus => found.get("status").value)
          .unwrapOr("unplanned"),
        fits: item.fits,
      };
    }),
  };
}
