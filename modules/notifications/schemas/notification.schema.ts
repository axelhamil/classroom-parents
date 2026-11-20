import { childAccount } from "@modules/children/schemas/child.schema";
import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { NOTIFICATION_KINDS } from "../src/domain/notification-content";

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    childId: uuid("child_id").references(() => childAccount.id, { onDelete: "cascade" }),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    members: text("members").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    unique("notification_ref_once").on(table.userId, table.ref),
    index("notification_feed_idx").on(table.userId, table.createdAt.desc(), table.id.desc()),
    index("notification_unread_idx").on(table.userId).where(sql`${table.readAt} is null`),
    index("notification_created_idx").on(table.createdAt),
    index("notification_child_idx").on(table.childId),
  ],
);
