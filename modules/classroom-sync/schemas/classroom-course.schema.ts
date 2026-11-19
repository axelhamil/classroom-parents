import { childAccount } from "@modules/children/schemas/child.schema";
import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const classroomCourse = pgTable(
  "classroom_course",
  {
    childId: uuid("child_id")
      .notNull()
      .references(() => childAccount.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull(),
    name: text("name").notNull(),
    listedAt: timestamp("listed_at", { withTimezone: true }).notNull(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [primaryKey({ columns: [table.childId, table.courseId] })],
);
