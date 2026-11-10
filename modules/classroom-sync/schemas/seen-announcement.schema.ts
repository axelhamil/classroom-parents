import { childAccount } from "@modules/children/schemas/child.schema";
import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { LEDGER_OUTCOMES } from "../src/domain/announcement-ledger";

export const seenAnnouncement = pgTable(
  "seen_announcement",
  {
    childId: uuid("child_id")
      .notNull()
      .references(() => childAccount.id, { onDelete: "cascade" }),
    announcementId: text("announcement_id").notNull(),
    courseId: text("course_id").notNull(),
    outcome: text("outcome", { enum: LEDGER_OUTCOMES }).notNull(),
    attempts: integer("attempts").notNull(),
    seenAt: timestamp("seen_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.childId, table.announcementId] })],
);
