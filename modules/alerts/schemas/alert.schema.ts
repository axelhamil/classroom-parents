import { agendaEvent } from "@modules/agenda/schemas/event.schema";
import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { ALERT_ORIGINS } from "../src/domain/value-objects/alert-origin.vo";
import { ALERT_STATUSES } from "../src/domain/value-objects/alert-status.vo";

export const DELIVERY_CHANNELS = ["push", "email"] as const;
export const DELIVERY_OUTCOMES = ["sent", "failed"] as const;

export const alert = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    eventId: uuid("event_id")
      .notNull()
      .unique()
      .references(() => agendaEvent.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    origin: text("origin", { enum: ALERT_ORIGINS }).notNull(),
    status: text("status", { enum: ALERT_STATUSES }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    failures: integer("failures").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  },
  (table) => [
    index("alert_pending_due_idx").on(table.dueAt).where(sql`${table.status} = 'pending'`),
  ],
);

export const alertDelivery = pgTable(
  "alert_delivery",
  {
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alert.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: DELIVERY_CHANNELS }).notNull(),
    outcome: text("outcome", { enum: DELIVERY_OUTCOMES }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (table) => [unique("alert_delivery_alert_channel_key").on(table.alertId, table.channel)],
);
