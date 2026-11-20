import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Validated extraction results shared between the families that read the same announcement
 * text in the same language and date order. No column names a family: the text is kept only as its SHA-256, so a result can be
 * found only by someone holding that text. Rows unread for 60 days leave with the retention
 * sweep; deleting a family leaves them, they hold nothing of it.
 */
export const extractionResult = pgTable(
  "extraction_result",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    announcementId: text("announcement_id").notNull(),
    contentHash: text("content_hash").notNull(),
    publishedOn: date("published_on", { mode: "string" }).notNull(),
    timeZone: text("time_zone").notNull(),
    outputLocale: text("output_locale").notNull().default("fr"),
    dateOrder: text("date_order").notNull().default("day-month"),
    promptVersion: text("prompt_version").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("extraction_result_key").on(
      table.contentHash,
      table.publishedOn,
      table.timeZone,
      table.promptVersion,
      table.outputLocale,
      table.dateOrder,
      table.announcementId,
    ),
    index("extraction_result_last_read_idx").on(table.lastReadAt),
    check("extraction_result_content_hash_sha256", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "extraction_result_output_locale",
      sql`${table.outputLocale} in ('fr', 'en', 'es', 'pt', 'ar')`,
    ),
    check(
      "extraction_result_date_order",
      sql`${table.dateOrder} in ('day-month', 'month-day', 'unknown')`,
    ),
    check(
      "extraction_result_prompt_version_slug",
      sql`${table.promptVersion} ~ '^[a-z0-9][a-z0-9.-]{0,47}$'`,
    ),
  ],
);
