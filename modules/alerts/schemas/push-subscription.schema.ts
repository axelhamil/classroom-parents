import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("push_subscription_user_idx").on(table.userId),
    index("push_subscription_session_idx").on(table.sessionId),
  ],
);

export const pushLockScreen = pgTable("push_lock_screen", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  details: boolean("details").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
