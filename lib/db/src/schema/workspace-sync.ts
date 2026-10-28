import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, timestamp } from "drizzle-orm/pg-core";
import { studyUsersTable } from "./study-users";
import { z } from "zod/v4";

export const workspaceSyncTable = pgTable("study_desk_workspace_sync", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => studyUsersTable.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, string>>().notNull().default({}),
  revision: integer("revision").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWorkspaceSyncSchema = createInsertSchema(workspaceSyncTable);

export type InsertWorkspaceSync = z.infer<typeof insertWorkspaceSyncSchema>;
export type WorkspaceSync = typeof workspaceSyncTable.$inferSelect;
