import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import { and, dbOperationFailure, eq, inArray, resolveExecutor } from "@packages/drizzle";
import {
  alertDefaultReminders,
  alertEventReminders,
} from "../../../schemas/reminder-settings.schema";
import { type AlertsError, alertNotFound } from "../../application/ports/alert-repository.port";
import type { IReminderSettingsRepository } from "../../application/ports/reminder-settings.port";
import type { ReminderValue } from "../../domain/value-objects/reminder.vo";
import { ReminderList } from "../../domain/value-objects/reminder-list.vo";

const dbAttrs = { "db.system.name": "postgresql" } as const;

const repositoryFailure = dbOperationFailure("ALERT_PROVIDER_FAILURE");

export class DrizzleReminderSettingsRepository implements IReminderSettingsRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async defaultsFor(userId: string): Promise<Result<Option<ReminderList>, AlertsError>> {
    const exec = resolveExecutor();
    return this.read("defaultsFor", userId, () =>
      exec
        .select({ reminders: alertDefaultReminders.reminders })
        .from(alertDefaultReminders)
        .where(eq(alertDefaultReminders.userId, userId))
        .limit(1),
    );
  }

  async eventPlanFor(
    userId: string,
    eventId: string,
  ): Promise<Result<Option<ReminderList>, AlertsError>> {
    const exec = resolveExecutor();
    return this.read("eventPlanFor", eventId, () =>
      exec
        .select({ reminders: alertEventReminders.reminders })
        .from(alertEventReminders)
        .where(
          and(eq(alertEventReminders.eventId, eventId), eq(alertEventReminders.userId, userId)),
        )
        .limit(1),
    );
  }

  async eventPlansFor(
    userId: string,
    eventIds: string[],
  ): Promise<Result<Map<string, ReminderList>, AlertsError>> {
    const exec = resolveExecutor();
    return this.write("eventPlansFor", async () => {
      const plans = new Map<string, ReminderList>();
      if (eventIds.length === 0) return Result.ok(plans);

      const query = exec
        .select({ eventId: alertEventReminders.eventId, reminders: alertEventReminders.reminders })
        .from(alertEventReminders)
        .where(
          and(
            inArray(alertEventReminders.eventId, eventIds),
            eq(alertEventReminders.userId, userId),
          ),
        );
      const rows = await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      for (const row of rows) {
        const reminders = ReminderList.from(row.reminders);
        if (reminders.isFailure) {
          this.instrumentation.capture(
            new Error(`reminders of ${row.eventId}: ${reminders.getError()}`),
          );
          return Result.fail(repositoryFailure("eventPlansFor"));
        }
        plans.set(row.eventId, reminders.getValue());
      }
      return Result.ok(plans);
    });
  }

  async saveDefaults(
    userId: string,
    reminders: ReminderList,
    at: Date,
  ): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.write("saveDefaults", async () => {
      const values = { reminders: reminders.value, updatedAt: at };
      const query = exec
        .insert(alertDefaultReminders)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: alertDefaultReminders.userId, set: values });
      await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      return Result.ok();
    });
  }

  async saveEventPlan(
    userId: string,
    eventId: string,
    reminders: ReminderList,
    at: Date,
  ): Promise<Result<void, AlertsError>> {
    const exec = resolveExecutor();
    return this.write("saveEventPlan", async () => {
      const values = { reminders: reminders.value, updatedAt: at };
      const query = exec
        .insert(alertEventReminders)
        .values({ eventId, userId, ...values })
        .onConflictDoUpdate({
          target: alertEventReminders.eventId,
          set: values,
          setWhere: eq(alertEventReminders.userId, userId),
        })
        .returning({ eventId: alertEventReminders.eventId });
      const written = await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      if (written.length === 0) return Result.fail(alertNotFound);

      return Result.ok();
    });
  }

  async clearEventPlan(userId: string, eventId: string): Promise<Result<boolean, AlertsError>> {
    const exec = resolveExecutor();
    return this.write("clearEventPlan", async () => {
      const query = exec
        .delete(alertEventReminders)
        .where(
          and(eq(alertEventReminders.eventId, eventId), eq(alertEventReminders.userId, userId)),
        )
        .returning({ eventId: alertEventReminders.eventId });
      const deleted = await this.instrumentation.startSpan(
        { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
        () => query.execute(),
      );
      return Result.ok(deleted.length > 0);
    });
  }

  private async read(
    method: string,
    subject: string,
    build: () => { toSQL(): { sql: string }; execute(): Promise<{ reminders: ReminderValue[] }[]> },
  ): Promise<Result<Option<ReminderList>, AlertsError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleReminderSettingsRepository > ${method}` },
      async () => {
        try {
          const query = build();
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );
          const row = rows[0];
          if (!row) return Result.ok(Option.none());

          const reminders = ReminderList.from(row.reminders);
          if (reminders.isFailure) {
            this.instrumentation.capture(
              new Error(`reminders of ${subject}: ${reminders.getError()}`),
            );
            return Result.fail(repositoryFailure(method));
          }
          return Result.ok(Option.some(reminders.getValue()));
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }

  private async write<T>(
    method: string,
    work: () => Promise<Result<T, AlertsError>>,
  ): Promise<Result<T, AlertsError>> {
    return this.instrumentation.startSpan(
      { name: `DrizzleReminderSettingsRepository > ${method}` },
      async () => {
        try {
          return await work();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(repositoryFailure(method));
        }
      },
    );
  }
}
