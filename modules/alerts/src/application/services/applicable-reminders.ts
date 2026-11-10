import { type Option, Result } from "@packages/ddd-kit";
import type { AlertDeadline } from "../../domain/alert.aggregate";
import { AlertOrigin } from "../../domain/value-objects/alert-origin.vo";
import { ReminderList, type ResolvedReminder } from "../../domain/value-objects/reminder-list.vo";
import type { AlertsError } from "../ports/alert-repository.port";
import type { EventDeadline } from "../ports/event-deadlines.port";
import type { IReminderSettingsRepository } from "../ports/reminder-settings.port";

export interface ApplicableReminders {
  reminders: ReminderList;
  origin: AlertOrigin;
  customized: boolean;
}

export interface ReminderTarget extends AlertDeadline {
  time?: string;
}

export function reminderTarget(deadline: EventDeadline): ReminderTarget {
  return { at: deadline.deadlineAt, date: deadline.deadlineDate, time: deadline.deadlineTime };
}

export function ringsBefore({ time }: ResolvedReminder, deadline: AlertDeadline): boolean {
  return time.isSome() && time.unwrap().value.at.getTime() < deadline.at.getTime();
}

export function fromDefaults(defaults: Option<ReminderList>): ApplicableReminders {
  return {
    reminders: defaults.unwrapOr(ReminderList.defaults()),
    origin: AlertOrigin.byDefault(),
    customized: false,
  };
}

export function fromEventPlan(reminders: ReminderList): ApplicableReminders {
  return { reminders, origin: AlertOrigin.user(), customized: true };
}

export async function applicableReminders(
  settings: IReminderSettingsRepository,
  userId: string,
  eventId: string,
): Promise<Result<ApplicableReminders, AlertsError>> {
  const plan = await settings.eventPlanFor(userId, eventId);
  if (plan.isFailure) return Result.fail(plan.getError());
  if (plan.getValue().isSome()) return Result.ok(fromEventPlan(plan.getValue().unwrap()));

  const defaults = await settings.defaultsFor(userId);
  return defaults.map(fromDefaults);
}
