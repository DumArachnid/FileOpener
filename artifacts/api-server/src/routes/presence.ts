import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetDeveloperOnlineCountResponse,
  RecordAnonymousVisitorBody,
} from "@workspace/api-zod";
import {
  db,
  studyPresenceTable,
  studyUsersTable,
  visitorProfilesTable,
} from "@workspace/db";
import { requireAccount, requireDeveloperRank } from "../middlewares/accountSession";
import { hashVisitorId } from "../lib/visitorProfiles";

const router: IRouter = Router();
const ONLINE_WINDOW_SECONDS = 90;

router.post("/visitor/first-visit", async (req, res): Promise<void> => {
  const parsed = RecordAnonymousVisitorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a valid anonymous visitor identifier." });
    return;
  }

  await db
    .insert(visitorProfilesTable)
    .values({ visitorKeyHash: hashVisitorId(parsed.data.visitorId) })
    .onConflictDoNothing();
  res.sendStatus(204);
});

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
  async (req, res): Promise<void> => {
    const activeSince = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
    const [result] = await db
      .select({
        count: sql<number>`(
          select count(*)::int
          from ${studyPresenceTable}
          inner join ${studyUsersTable}
            on ${studyPresenceTable.userId} = ${studyUsersTable.id}
          where ${studyPresenceTable.lastSeenAt} > ${activeSince}
            and (
              ${studyUsersTable.bannedAt} is null
              or (
                ${studyUsersTable.bannedUntil} is not null
                and ${studyUsersTable.bannedUntil} <= ${new Date()}
              )
            )
        )`,
        registeredAccountCount: sql<number>`(
          select count(*)::int from ${studyUsersTable}
        )`,
        anonymousVisitorCount: sql<number>`(
          select count(*)::int
          from ${visitorProfilesTable}
          where ${visitorProfilesTable.accountId} is null
        )`,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.id, req.studyDeskUser!.id))
      .limit(1);
    res.json(GetDeveloperOnlineCountResponse.parse({
      count: Number(result?.count ?? 0),
      activityWindowSeconds: ONLINE_WINDOW_SECONDS,
      registeredAccountCount: Number(result?.registeredAccountCount ?? 0),
      anonymousVisitorCount: Number(result?.anonymousVisitorCount ?? 0),
    }));
  },
);

export default router;
