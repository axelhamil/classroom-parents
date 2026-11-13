import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { DELIVERY_CHANNELS } from "./alert.schema";

export const DIGEST_STATUSES = ["pending", "sent", "skipped", "missed"] as const;

export const alertDigestPreference = pgTable("alert_digest_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const alertWeeklyDigest = pgTable(
  "alert_weekly_digest",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: DIGEST_STATUSES }).notNull().default("pending"),
    channel: text("channel", { enum: DELIVERY_CHANNELS }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failures: integer("failures").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("alert_weekly_digest_week_user_key").on(table.weekStart, table.userId),
    index("alert_weekly_digest_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);
