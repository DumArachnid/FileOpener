import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { studyUsersTable } from "./study-users";

export const suspensionAppealsTable = pgTable(
  "study_desk_suspension_appeals",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => studyUsersTable.id, { onDelete: "cascade" }),
    suspensionStartedAt: timestamp("suspension_started_at", { withTimezone: true }).notNull(),
    statement: text("statement").notNull(),
    status: text("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    reviewerUsername: text("reviewer_username"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("study_desk_suspension_appeal_case_idx").on(table.userId, table.suspensionStartedAt),
    index("study_desk_suspension_appeal_queue_idx").on(table.status, table.submittedAt),
  ],
);

export const insertSuspensionAppealSchema = createInsertSchema(suspensionAppealsTable).omit({
  id: true,
  submittedAt: true,
  decidedAt: true,
});

export type InsertSuspensionAppeal = z.infer<typeof insertSuspensionAppealSchema>;
export type SuspensionAppeal = typeof suspensionAppealsTable.$inferSelect;
