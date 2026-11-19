import { authSchema } from "@packages/drizzle";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const homeLayout = pgTable("home_layout", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  blocks: jsonb("blocks").$type<unknown[]>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const homeNote = pgTable("home_note", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
