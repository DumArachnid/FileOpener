import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { GetDeveloperOnlineCountResponse } from "@workspace/api-zod";
import { db, studyPresenceTable, studyUsersTable } from "@workspace/db";
import { requireAccount, requireDeveloperRank } from "../middlewares/accountSession";

const router: IRouter = Router();
const ONLINE_WINDOW_SECONDS = 90;

router.post("/presence/heartbeat", requireAccount, async (req, res): Promise<void> => {
  const now = new Date();
  await db
    .insert(studyPresenceTable)
    .values({ userId: req.studyDeskUser!.id, lastSeenAt: now })
    .onConflictDoUpdate({
      target: studyPresenceTable.userId,
      set: { lastSeenAt: now },
    });
  res.sendStatus(204);
});

router.get(
  "/developer/online-count",
  requireAccount,
  requireDeveloperRank,
  async (_req, res): Promise<void> => {
    const activeSince = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyPresenceTable)
      .innerJoin(studyUsersTable, eq(studyPresenceTable.userId, studyUsersTable.id))
      .where(and(
        gt(studyPresenceTable.lastSeenAt, activeSince),
        or(
          isNull(studyUsersTable.bannedAt),
          and(
            isNotNull(studyUsersTable.bannedUntil),
            lte(studyUsersTable.bannedUntil, new Date()),
          ),
        ),
      ));
    res.json(GetDeveloperOnlineCountResponse.parse({
      count: Number(result?.count ?? 0),
      activityWindowSeconds: ONLINE_WINDOW_SECONDS,
    }));
  },
);

export default router;
