import { createInsertSchema } from "drizzle-zod";
import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { studyUsersTable } from "./study-users";
import { z } from "zod/v4";

export const adminAuditTable = pgTable(
  "study_desk_admin_audit",
  {
    id: serial("id").primaryKey(),
    actorUsername: text("actor_username").notNull(),
    targetUsername: text("target_username").notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("study_desk_admin_audit_target_idx").on(table.targetUsername, table.createdAt),
    index("study_desk_admin_audit_actor_idx").on(table.actorUsername, table.createdAt),
  ],
);

export const adminRewardTotalsTable = pgTable("study_desk_admin_reward_totals", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  points: integer("points").notNull().default(0),
  shards: integer("shards").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminAuditSchema = createInsertSchema(adminAuditTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminAudit = z.infer<typeof insertAdminAuditSchema>;
export type AdminAudit = typeof adminAuditTable.$inferSelect;
