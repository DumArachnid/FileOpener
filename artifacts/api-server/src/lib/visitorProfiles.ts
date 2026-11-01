import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, visitorProfilesTable } from "@workspace/db";

export function hashVisitorId(visitorId: string): string {
  return createHash("sha256").update(visitorId).digest("hex");
}

export async function associateVisitorWithAccount(
  visitorId: string | undefined,
  accountId: number,
): Promise<boolean> {
  if (!visitorId) return false;

  const now = new Date();
  await db
    .insert(visitorProfilesTable)
    .values({
      visitorKeyHash: hashVisitorId(visitorId),
      accountId,
      linkedAt: now,
    })
    .onConflictDoUpdate({
      target: visitorProfilesTable.visitorKeyHash,
      set: {
        accountId,
        linkedAt: sql`coalesce(${visitorProfilesTable.linkedAt}, excluded.linked_at)`,
      },
    });
  return true;
}
