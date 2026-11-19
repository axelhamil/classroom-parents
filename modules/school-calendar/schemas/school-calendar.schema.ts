import { authSchema } from "@packages/drizzle";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const schoolZonePreference = pgTable("school_zone_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  zone: text("zone").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const schoolCalendarCache = pgTable("school_calendar_cache", {
  key: text("key").primaryKey(),
  entries: jsonb("entries").$type<unknown[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
