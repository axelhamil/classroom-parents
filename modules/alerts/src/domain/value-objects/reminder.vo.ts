import { Option, Result, ValueObject } from "@packages/ddd-kit";
import { z } from "zod";
import { AlertTime, WALL_TIME } from "./alert-time.vo";

export const REMINDER_DAYS_MAX = 14;
export const REMINDER_HOURS_MIN = 1;
export const REMINDER_HOURS_MAX = 48;

const HOUR_MS = 3_600_000;
const KEY_PATTERN = /^(?:d(\d{1,2})@(\d{2}:\d{2})|h(\d{1,2}))$/;

export const reminderSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("days_before"),
    days: z.int().min(0).max(REMINDER_DAYS_MAX),
    time: z.string().regex(WALL_TIME),
  }),
  z.strictObject({
    kind: z.literal("hours_before"),
    hours: z.int().min(REMINDER_HOURS_MIN).max(REMINDER_HOURS_MAX),
  }),
]);

export type ReminderValue = z.infer<typeof reminderSchema>;

export interface ReminderDeadline {
  at: Date;
  date: string;
  time?: string;
}

export class Reminder extends ValueObject<ReminderValue> {
  static fromKey(key: string): Result<Reminder> {
    const match = KEY_PATTERN.exec(key);
    if (!match) return Result.fail(`${key} is not a reminder key`);

    const [, days, time, hours] = match;
    if (hours !== undefined) return Reminder.create({ kind: "hours_before", hours: Number(hours) });

    return Reminder.create({ kind: "days_before", days: Number(days), time: time ?? "" });
  }

  key(): string {
    const value = this.value;
    if (value.kind === "hours_before") return `h${value.hours}`;

    return `d${value.days}@${value.time}`;
  }

  resolve(deadline: ReminderDeadline): Result<Option<AlertTime>> {
    const value = this.value;
    if (value.kind === "days_before")
      return AlertTime.before(deadline.date, value.days, value.time).map((time) =>
        Option.some(time),
      );
    if (deadline.time === undefined) return Result.ok(Option.none());

    return AlertTime.fromInstant(new Date(deadline.at.getTime() - value.hours * HOUR_MS)).map(
      (time) => Option.some(time),
    );
  }

  protected validate(value: ReminderValue): Result<ReminderValue> {
    const parsed = reminderSchema.safeParse(value);
    if (!parsed.success)
      return Result.fail(
        `a reminder is 0 to ${REMINDER_DAYS_MAX} days before at HH:MM, or ${REMINDER_HOURS_MIN} to ${REMINDER_HOURS_MAX} hours before`,
      );

    return Result.ok(parsed.data);
  }
}
