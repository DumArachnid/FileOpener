import { createInsertSchema } from "drizzle-zod";
import { boolean, index, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const randomLinksTable = pgTable(
  "study_desk_random_links",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("study_desk_random_links_url_unique_idx").on(table.url),
    index("study_desk_random_links_enabled_created_idx").on(table.enabled, table.createdAt),
  ],
);

export const insertRandomLinkSchema = createInsertSchema(randomLinksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRandomLink = z.infer<typeof insertRandomLinkSchema>;
export type RandomLink = typeof randomLinksTable.$inferSelect;
