import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { CHILD_STATUSES, RECONNECT_CAUSES } from "../src/domain/value-objects/child-status.vo";

export const childAccount = pgTable(
  "child_account",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    userId: text("user_id")
      .notNull()
      .references(() => authSchema.user.id, { onDelete: "cascade" }),
    linkedAccountId: text("linked_account_id")
      .notNull()
      .unique()
      .references(() => authSchema.account.id, { onDelete: "cascade" }),
    googleEmail: text("google_email").notNull(),
    label: text("label").notNull(),
    status: text("status", { enum: CHILD_STATUSES }).notNull(),
    cause: text("cause", { enum: RECONNECT_CAUSES }),
    connectedAt: timestamp("connected_at").notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    nextSyncAt: timestamp("next_sync_at").notNull(),
    syncStartedAt: timestamp("sync_started_at"),
    syncAttempts: integer("sync_attempts").notNull().default(0),
    syncLease: integer("sync_lease").notNull().default(0),
    lastSyncRequestedAt: timestamp("last_sync_requested_at"),
  },
  (table) => [
    index("child_account_user_idx").on(table.userId),
    index("child_account_due_idx").on(table.nextSyncAt).where(sql`${table.status} = 'connected'`),
    index("child_account_disconnecting_idx")
      .on(table.nextSyncAt)
      .where(sql`${table.status} = 'disconnecting'`),
  ],
);
