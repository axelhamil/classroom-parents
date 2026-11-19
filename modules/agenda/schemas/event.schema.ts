import { childAccount } from "@modules/children/schemas/child.schema";
import { authSchema } from "@packages/drizzle";
import { EVENT_CATEGORIES, REVIEW_REASONS } from "@packages/events/agenda-contract";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { EDITABLE_FIELDS } from "../src/domain/event.aggregate";
import { AMENDMENT_KINDS } from "../src/domain/value-objects/event-amendment.vo";
import type { StoredChecklist } from "../src/domain/value-objects/event-checklist.vo";
import { EVENT_SOURCES } from "../src/domain/value-objects/event-source.vo";
import { EVENT_STATUSES } from "../src/domain/value-objects/event-status.vo";

export const agendaEvent = pgTable(
  "event",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => childAccount.id, { onDelete: "cascade" }),
    source: text("source", { enum: EVENT_SOURCES }).notNull().default("announcement"),
    announcementId: text("announcement_id").notNull(),
    ordinal: integer("ordinal").notNull(),
    courseId: text("course_id"),
    announcementUrl: text("announcement_url"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category", { enum: EVENT_CATEGORIES }).notNull(),
    deadlineDate: date("deadline_date", { mode: "string" }).notNull(),
    deadlineTime: time("deadline_time"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: EVENT_STATUSES }).notNull(),
    reviewReasons: text("review_reasons", { enum: REVIEW_REASONS })
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    evidenceQuote: text("evidence_quote"),
    evidenceStart: integer("evidence_start"),
    evidenceEnd: integer("evidence_end"),
    evidenceBefore: text("evidence_before").notNull().default(""),
    evidenceAfter: text("evidence_after").notNull().default(""),
    amendReason: text("amend_reason", { enum: AMENDMENT_KINDS }),
    confirmedByParentAt: timestamp("confirmed_by_parent_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    checklist: jsonb("checklist")
      .$type<StoredChecklist>()
      .notNull()
      .default({ done: [], removed: [], extra: [] }),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    editedFields: text("edited_fields", { enum: EDITABLE_FIELDS })
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("event_child_source_item_key").on(
      table.childId,
      table.source,
      table.announcementId,
      table.ordinal,
    ),
    index("event_user_deadline_idx").on(table.userId, table.deadlineAt),
    index("event_dismissed_deadline_idx")
      .on(table.deadlineAt)
      .where(sql`${table.deletedAt} is not null or ${table.withdrawnAt} is not null`),
  ],
);
