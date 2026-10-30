import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const randomLinkClaimsTable = pgTable("study_desk_random_link_claims", {
  identityKey: text("identity_key").primaryKey(),
  lastClaimedAt: timestamp("last_claimed_at", { withTimezone: true }).notNull(),
});
