import { authSchema } from "@packages/drizzle";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CHILD_STATUSES, RECONNECT_CAUSES } from "../src/domain/value-objects/child-status.vo";

/**
 * Statuses the scheduled sync claims, written as SQL literals: a partial index only serves a
 * query whose predicate the planner can prove implies the index's own, which a bound parameter
 * never does in a generic plan. The due index and the claim query share this one predicate.
 */
export function syncedStatus(status: AnyPgColumn) {
  return sql`${status} in ('connected', 'blocked_by_school')`;
}

/** Same contract as `syncedStatus`, for the disconnect resumption and its partial index. */
export function disconnectingStatus(status: AnyPgColumn) {
  return sql`${status} = 'disconnecting'`;
}

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
    color: smallint("color").notNull(),
    avatarUrl: text("avatar_url"),
    showsPhoto: boolean("shows_photo").notNull().default(false),
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
    index("child_account_due_idx").on(table.nextSyncAt).where(syncedStatus(table.status)),
    index("child_account_disconnecting_idx")
      .on(table.nextSyncAt)
      .where(disconnectingStatus(table.status)),
    check("child_account_color_hue", sql`${table.color} BETWEEN 1 AND 16`),
  ],
);
