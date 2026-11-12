import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { authSchema } from "@packages/drizzle";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ReminderValue } from "../src/domain/value-objects/reminder.vo";

export const alertDefaultReminders = pgTable("alert_default_reminders", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  reminders: jsonb("reminders").$type<ReminderValue[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const alertEventReminders = pgTable(
  "alert_event_reminders",
  {
    eventId: uuid("event_id")
      .primaryKey()
      .references(() => agendaEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    reminders: jsonb("reminders").$type<ReminderValue[]>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("alert_event_reminders_user_idx").on(table.userId)],
);
