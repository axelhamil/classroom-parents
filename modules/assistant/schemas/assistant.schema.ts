import { authSchema } from "@packages/drizzle";
import { LLM_FEATURES } from "@packages/llm/contract/language-model.port";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const assistantPreference = pgTable("assistant_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  locale: text("locale"),
  timeZone: text("time_zone"),
  country: text("country"),
  extractionEnabled: boolean("extraction_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    month: date("month", { mode: "string" }).notNull(),
    feature: text("feature", { enum: LLM_FEATURES }).notNull(),
    calls: integer("calls").notNull(),
    escalations: integer("escalations").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull(),
  },
  (table) => [
    unique("ai_usage_family_month_feature").on(table.userId, table.month, table.feature),
    index("ai_usage_month_idx").on(table.month),
    check("ai_usage_month_first_day", sql`extract(day from ${table.month}) = 1`),
    check(
      "ai_usage_counts_positive",
      sql`${table.calls} >= 0 and ${table.escalations} between 0 and ${table.calls} and ${table.costMicroUsd} >= 0`,
    ),
  ],
);

export const AI_USAGE_ALERT_KINDS = ["family_cap", "global_spend", "output_invalid"] as const;

export type AiUsageAlertKind = (typeof AI_USAGE_ALERT_KINDS)[number];

export const aiUsageAlert = pgTable(
  "ai_usage_alert",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    kind: text("kind", { enum: AI_USAGE_ALERT_KINDS }).notNull(),
    period: text("period").notNull(),
    userId: text("user_id").references(() => authSchema.user.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("ai_usage_alert_once").on(table.kind, table.period, table.userId).nullsNotDistinct(),
    index("ai_usage_alert_sent_idx").on(table.sentAt),
  ],
);
