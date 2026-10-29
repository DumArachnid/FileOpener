import { and, eq, isNotNull, lte } from "drizzle-orm";
import { adminAuditTable, db, studyUsersTable } from "@workspace/db";

export function isSuspensionActive(
  bannedAt: Date | null,
  bannedUntil: Date | null,
  now = new Date(),
): boolean {
  return Boolean(bannedAt && (!bannedUntil || bannedUntil > now));
}

export async function expireSuspensionForUser(userId: number, now = new Date()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [expired] = await tx
      .update(studyUsersTable)
      .set({ bannedAt: null, bannedUntil: null, banReason: null })
      .where(
        and(
          eq(studyUsersTable.id, userId),
          isNotNull(studyUsersTable.bannedAt),
          isNotNull(studyUsersTable.bannedUntil),
          lte(studyUsersTable.bannedUntil, now),
        ),
      )
      .returning({
        username: studyUsersTable.username,
        bannedAt: studyUsersTable.bannedAt,
        bannedUntil: studyUsersTable.bannedUntil,
      });
    if (!expired) return false;
    await tx.insert(adminAuditTable).values({
      actorUsername: "system",
      targetUsername: expired.username,
      action: "user.suspension.expired",
      reason: null,
      details: {
        suspensionStartedAt: expired.bannedAt?.toISOString() ?? null,
        suspensionEndedAt: expired.bannedUntil?.toISOString() ?? now.toISOString(),
      },
    });
    return true;
  });
}

export async function expireDueSuspensions(now = new Date()): Promise<number> {
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(studyUsersTable)
      .set({ bannedAt: null, bannedUntil: null, banReason: null })
      .where(
        and(
          isNotNull(studyUsersTable.bannedAt),
          isNotNull(studyUsersTable.bannedUntil),
          lte(studyUsersTable.bannedUntil, now),
        ),
      )
      .returning({
        username: studyUsersTable.username,
        bannedAt: studyUsersTable.bannedAt,
        bannedUntil: studyUsersTable.bannedUntil,
      });
    if (expired.length) {
      await tx.insert(adminAuditTable).values(
        expired.map((row) => ({
          actorUsername: "system",
          targetUsername: row.username,
          action: "user.suspension.expired",
          reason: null,
          details: {
            suspensionStartedAt: row.bannedAt?.toISOString() ?? null,
            suspensionEndedAt: row.bannedUntil?.toISOString() ?? now.toISOString(),
          },
        })),
      );
    }
    return expired.length;
  });
}
