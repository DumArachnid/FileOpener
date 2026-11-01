import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { studyUsersTable } from "./study-users";

export const visitorProfilesTable = pgTable(
  "study_desk_visitor_profiles",
  {
    visitorKeyHash: text("visitor_key_hash").primaryKey(),
    accountId: integer("account_id").references(() => studyUsersTable.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
  },
  (table) => [index("study_desk_visitor_profiles_account_idx").on(table.accountId)],
);

export const insertVisitorProfileSchema = createInsertSchema(visitorProfilesTable).omit({
  firstSeenAt: true,
});
export type InsertVisitorProfile = z.infer<typeof insertVisitorProfileSchema>;
export type VisitorProfile = typeof visitorProfilesTable.$inferSelect;
