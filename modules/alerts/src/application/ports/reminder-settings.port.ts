import type { Option, Result } from "@packages/ddd-kit";
import type { ReminderList } from "../../domain/value-objects/reminder-list.vo";
import type { AlertsError } from "./alert-repository.port";

export interface IReminderSettingsRepository {
  defaultsFor(userId: string): Promise<Result<Option<ReminderList>, AlertsError>>;

  saveDefaults(
    userId: string,
    reminders: ReminderList,
    at: Date,
  ): Promise<Result<void, AlertsError>>;

  eventPlanFor(userId: string, eventId: string): Promise<Result<Option<ReminderList>, AlertsError>>;

  eventPlansFor(
    userId: string,
    eventIds: string[],
  ): Promise<Result<Map<string, ReminderList>, AlertsError>>;

  saveEventPlan(
    userId: string,
    eventId: string,
    reminders: ReminderList,
    at: Date,
  ): Promise<Result<void, AlertsError>>;

  clearEventPlan(userId: string, eventId: string): Promise<Result<boolean, AlertsError>>;
}
