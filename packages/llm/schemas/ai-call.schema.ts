import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { LLM_FEATURES } from "../src/contract/language-model.port";
import { MODEL_IDS } from "../src/provider/models";

export const AI_CALL_OUTCOMES = [
  "ok",
  "input_invalid",
  "output_invalid",
  "provider_failure",
  "rate_limited",
  "aborted",
] as const;

export type AiCallOutcome = (typeof AI_CALL_OUTCOMES)[number];

/**
 * One row per model call, never its content: who paid, for which feature and prompt, what it
 * cost and how it ended. `input_hash` lets an operator match two calls on the same content
 * without storing it. Every text column is an enum or a checked format, so free text has
 * nowhere to land.
 */
export const aiCall = pgTable(
  "ai_call",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    feature: text("feature", { enum: LLM_FEATURES }).notNull(),
    model: text("model", { enum: MODEL_IDS }).notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    costMicroUsd: integer("cost_micro_usd").notNull(),
    outcome: text("outcome", { enum: AI_CALL_OUTCOMES }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_call_user_created_idx").on(table.userId, table.createdAt),
    index("ai_call_created_idx").on(table.createdAt),
    check("ai_call_input_hash_sha256", sql`${table.inputHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "ai_call_prompt_version_slug",
      sql`${table.promptVersion} ~ '^[a-z0-9][a-z0-9.-]{0,47}$'`,
    ),
  ],
);
