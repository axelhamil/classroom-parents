import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const schoolCalendarChoice = pgTable("school_calendar_choice", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  country: text("country").notNull(),
  region: text("region"),
  schoolHolidays: text("school_holidays").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const schoolHolidayPeriod = pgTable(
  "school_holiday_period",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    origin: text("origin").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("school_holiday_period_user_start_idx").on(table.userId, table.startsOn)],
);

export const schoolCalendarCache = pgTable("school_calendar_cache", {
  key: text("key").primaryKey(),
  entries: jsonb("entries").$type<unknown[]>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});
