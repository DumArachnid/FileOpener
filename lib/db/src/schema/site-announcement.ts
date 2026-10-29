import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const siteAnnouncementTable = pgTable("study_desk_site_announcement", {
  id: integer("id").primaryKey(),
  message: text("message").notNull(),
  createdByUsername: text("created_by_username").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertSiteAnnouncementSchema = createInsertSchema(siteAnnouncementTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSiteAnnouncement = z.infer<typeof insertSiteAnnouncementSchema>;
export type SiteAnnouncement = typeof siteAnnouncementTable.$inferSelect;
