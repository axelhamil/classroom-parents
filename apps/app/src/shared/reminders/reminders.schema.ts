import type { InferResponseType } from "hono/client";
import { z } from "zod";
import { api } from "../api/api-client";

const $defaults = api.reminders.defaults.$get;

export type Reminder = InferResponseType<typeof $defaults, 200>["reminders"][number];

export type ReminderKind = Reminder["kind"];

export const REMINDER_KINDS = ["days_before", "hours_before"] as const satisfies ReminderKind[];

export const REMINDERS_MAX = 5;
const DAYS_MAX = 14;
const HOURS_MIN = 1;
const HOURS_MAX = 48;

function wholeNumber(min: number, max: number, i18nKey: string) {
  return z
    .string()
    .refine((value) => /^\d{1,2}$/.test(value) && Number(value) >= min && Number(value) <= max, {
      params: { i18nKey },
    });
}

const reminderRowSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("days_before"),
    days: wholeNumber(0, DAYS_MAX, "validation.reminderDays"),
    time: z.iso.time({ precision: -1 }),
    hours: z.string(),
  }),
  z.object({
    kind: z.literal("hours_before"),
    hours: wholeNumber(HOURS_MIN, HOURS_MAX, "validation.reminderHours"),
    days: z.string(),
    time: z.string(),
  }),
]);

export const remindersSchema = z.object({
  reminders: z.array(reminderRowSchema).max(REMINDERS_MAX),
});

export type RemindersInput = z.infer<typeof remindersSchema>;

export type ReminderRow = RemindersInput["reminders"][number];

export const NEW_REMINDER_ROW: ReminderRow = {
  kind: "days_before",
  days: "1",
  time: "18:00",
  hours: "2",
};

export function toReminderRows(reminders: Reminder[]): RemindersInput {
  return {
    reminders: reminders.map((reminder) =>
      reminder.kind === "days_before"
        ? {
            ...NEW_REMINDER_ROW,
            kind: "days_before",
            days: String(reminder.days),
            time: reminder.time,
          }
        : { ...NEW_REMINDER_ROW, kind: "hours_before", hours: String(reminder.hours) },
    ),
  };
}

export interface ReminderRefusal {
  reminder: Reminder;
  message: string;
}

const refusedReminderSchema = z.object({
  reminder: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("days_before"), days: z.number(), time: z.string() }),
    z.object({ kind: z.literal("hours_before"), hours: z.number() }),
  ]),
});

export function refusedReminder(metadata: unknown): Reminder | undefined {
  const parsed = refusedReminderSchema.safeParse(metadata);
  return parsed.success ? parsed.data.reminder : undefined;
}

export function sameReminder(row: ReminderRow, reminder: Reminder): boolean {
  if (row.kind !== reminder.kind) return false;
  if (reminder.kind === "hours_before") return Number(row.hours) === reminder.hours;

  return Number(row.days) === reminder.days && row.time === reminder.time;
}

export function toReminders({ reminders }: RemindersInput): Reminder[] {
  return reminders.map((row) =>
    row.kind === "days_before"
      ? { kind: "days_before", days: Number(row.days), time: row.time }
      : { kind: "hours_before", hours: Number(row.hours) },
  );
}
