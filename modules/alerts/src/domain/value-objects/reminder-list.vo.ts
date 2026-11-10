import { type Option, Result, ValueObject } from "@packages/ddd-kit";
import type { AlertTime } from "./alert-time.vo";
import { Reminder, type ReminderDeadline, type ReminderValue } from "./reminder.vo";

export const REMINDERS_MAX = 5;

export const DEFAULT_REMINDER: ReminderValue = { kind: "days_before", days: 2, time: "18:00" };

export type ReminderRefusal = "too_many" | "out_of_range";

export interface PlannedReminder {
  reminder: Reminder;
  time: AlertTime;
}

export interface ResolvedReminder {
  reminder: Reminder;
  time: Option<AlertTime>;
}

export class ReminderList extends ValueObject<ReminderValue[], ReminderRefusal> {
  static from(values: ReminderValue[]): Result<ReminderList, ReminderRefusal> {
    return ReminderList.create<ReminderList, ReminderValue[], ReminderRefusal>(values);
  }

  static defaults(): ReminderList {
    return new ReminderList([DEFAULT_REMINDER]);
  }

  reminders(): Reminder[] {
    return this.value.map((value) => new Reminder(value));
  }

  resolve(deadline: ReminderDeadline): Result<ResolvedReminder[]> {
    const resolved: ResolvedReminder[] = [];
    for (const reminder of this.reminders()) {
      const time = reminder.resolve(deadline);
      if (time.isFailure) return Result.fail(time.getError());
      resolved.push({ reminder, time: time.getValue() });
    }
    return Result.ok(resolved);
  }

  plan(deadline: ReminderDeadline): Result<PlannedReminder[]> {
    return this.resolve(deadline).map((resolved) => {
      const planned: PlannedReminder[] = [];
      for (const { reminder, time } of resolved) {
        if (time.isNone()) continue;
        if (
          planned.some((kept) => kept.time.value.at.getTime() === time.unwrap().value.at.getTime())
        )
          continue;
        planned.push({ reminder, time: time.unwrap() });
      }
      return planned;
    });
  }

  protected validate(value: ReminderValue[]): Result<ReminderValue[], ReminderRefusal> {
    const unique = new Map<string, ReminderValue>();
    for (const item of value) {
      const reminder = Reminder.create(item);
      if (reminder.isFailure) return Result.fail("out_of_range");
      unique.set(reminder.getValue().key(), reminder.getValue().value);
    }
    if (unique.size > REMINDERS_MAX) return Result.fail("too_many");

    return Result.ok([...unique.values()]);
  }
}
