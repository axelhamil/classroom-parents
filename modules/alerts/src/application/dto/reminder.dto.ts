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

function alertOf(alerts: Alert[], { reminder, time }: ResolvedReminder): Option<Alert> {
  return time.flatMap((at) => {
    const current = alerts.filter((alert) => alert.get("time").equals(at));
    return Option.fromNullable(
      current.find((alert) => alert.key() === reminder.key()) ?? current[0],
    );
  });
}

export interface FittingReminder extends ResolvedReminder {
  fits: boolean;
}

export function toEventRemindersDto(
  resolved: FittingReminder[],
  customized: boolean,
  alerts: Alert[],
): EventRemindersDto {
  return {
    customized,
    reminders: resolved.map((item) => ({
      reminder: item.reminder.value,
      dueAt: item.time.map((at) => at.value.at.toISOString()).toNull(),
      status: alertOf(alerts, item)
        .map((alert): ReminderStatus => alert.get("status").value)
        .unwrapOr("unplanned"),
      fits: item.fits,
    })),
  };
}
