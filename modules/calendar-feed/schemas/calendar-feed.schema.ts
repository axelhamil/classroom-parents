import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const calendarFeed = pgTable("calendar_feed", {
  id: uuid("id").primaryKey().default(sql`uuidv7()`),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  secretHash: text("secret_hash").notNull().unique(),
  childIds: uuid("child_ids").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
});
