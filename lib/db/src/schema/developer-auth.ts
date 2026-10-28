import { index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const replitAuthSessionsTable = pgTable(
  "study_desk_replit_sessions",
  {
    sid: varchar("sid", { length: 128 }).primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("study_desk_replit_sessions_expire_idx").on(table.expire)],
);

export const replitAuthUsersTable = pgTable("study_desk_replit_users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ReplitAuthUser = typeof replitAuthUsersTable.$inferSelect;
