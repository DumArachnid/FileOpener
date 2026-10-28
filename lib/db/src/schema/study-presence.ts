import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { studyUsersTable } from "./study-users";

export const studyPresenceTable = pgTable(
  "study_desk_presence",
  {
    userId: integer("user_id")
      .primaryKey()
      .references(() => studyUsersTable.id, { onDelete: "cascade" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("study_desk_presence_last_seen_idx").on(table.lastSeenAt)],
);

export const insertStudyPresenceSchema = createInsertSchema(studyPresenceTable);
export type InsertStudyPresence = z.infer<typeof insertStudyPresenceSchema>;
export type StudyPresence = typeof studyPresenceTable.$inferSelect;
