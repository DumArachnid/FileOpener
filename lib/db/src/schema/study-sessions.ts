import { createInsertSchema } from "drizzle-zod";
import { index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { studyUsersTable } from "./study-users";
import { z } from "zod/v4";

export const studySessionsTable = pgTable(
  "study_desk_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => studyUsersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("study_desk_sessions_user_idx").on(table.userId),
    index("study_desk_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const insertStudySessionSchema = createInsertSchema(studySessionsTable).omit({
  createdAt: true,
});

export type InsertStudySession = z.infer<typeof insertStudySessionSchema>;
export type StudySession = typeof studySessionsTable.$inferSelect;
