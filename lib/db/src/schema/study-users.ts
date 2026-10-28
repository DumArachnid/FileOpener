import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studyUsersTable = pgTable(
  "study_desk_users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    recoveryCodeHash: text("recovery_code_hash").notNull(),
    role: text("role").notNull().default("user"),
    bannedAt: timestamp("banned_at", { withTimezone: true }),
    banReason: text("ban_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("study_desk_users_username_idx").on(table.username)],
);

export const insertStudyUserSchema = createInsertSchema(studyUsersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertStudyUser = z.infer<typeof insertStudyUserSchema>;
export type StudyUser = typeof studyUsersTable.$inferSelect;
