import { createInsertSchema } from "drizzle-zod";
import { boolean, index, pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { studyUsersTable } from "./study-users";
import { z } from "zod/v4";

export const communityExtensionsTable = pgTable(
  "study_desk_extensions",
  {
    id: text("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => studyUsersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    code: text("code").notNull(),
    version: text("version").notNull().default("1.0.0"),
    published: boolean("published").notNull().default(false),
    approvalStatus: text("approval_status").notNull().default("approved"),
    moderationNote: text("moderation_note"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: integer("reviewed_by").references(() => studyUsersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("study_desk_extensions_published_idx").on(table.published, table.updatedAt),
    index("study_desk_extensions_approval_idx").on(table.approvalStatus, table.published, table.updatedAt),
    index("study_desk_extensions_owner_idx").on(table.ownerId),
  ],
);

export const insertCommunityExtensionSchema = createInsertSchema(communityExtensionsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertCommunityExtension = z.infer<typeof insertCommunityExtensionSchema>;
export type CommunityExtension = typeof communityExtensionsTable.$inferSelect;
