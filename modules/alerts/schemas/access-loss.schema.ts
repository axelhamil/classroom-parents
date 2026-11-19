import { childAccount } from "@modules/children/schemas/child.schema";
import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { DELIVERY_CHANNELS } from "./alert.schema";

export const ACCESS_LOSS_STATUSES = ["pending", "sent", "missed", "cancelled"] as const;

export const alertAccessLoss = pgTable(
  "alert_access_loss",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => childAccount.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ACCESS_LOSS_STATUSES }).notNull().default("pending"),
    channel: text("channel", { enum: DELIVERY_CHANNELS }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("alert_access_loss_open_child_key")
      .on(table.childId)
      .where(sql`${table.closedAt} is null`),
    index("alert_access_loss_child_idx").on(table.childId),
    index("alert_access_loss_user_idx").on(table.userId),
    index("alert_access_loss_pending_due_idx")
      .on(table.dueAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);
