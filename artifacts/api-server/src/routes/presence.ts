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
    const dailyMetricsResult = await db.execute<{
      date: string;
      visitorCount: number;
      registrationCount: number;
      conversionCount: number;
    }>(sql`
      with days as (
        select generate_series(
          date_trunc('day', now() at time zone 'UTC') - interval '29 days',
          date_trunc('day', now() at time zone 'UTC'),
          interval '1 day'
        ) as day
      ),
      daily_counts as (
        select
          date_trunc('day', ${visitorProfilesTable.firstSeenAt} at time zone 'UTC') as day,
          count(*)::int as "visitorCount",
          0::int as "registrationCount",
          0::int as "conversionCount"
        from ${visitorProfilesTable}
        group by 1
        union all
        select
          date_trunc('day', ${studyUsersTable.createdAt} at time zone 'UTC') as day,
          0::int as "visitorCount",
          count(*)::int as "registrationCount",
          0::int as "conversionCount"
        from ${studyUsersTable}
        group by 1
        union all
        select
          date_trunc('day', ${visitorProfilesTable.linkedAt} at time zone 'UTC') as day,
          0::int as "visitorCount",
          0::int as "registrationCount",
          count(*)::int as "conversionCount"
        from ${visitorProfilesTable}
        where ${visitorProfilesTable.linkedAt} is not null
        group by 1
      )
      select
        to_char(days.day, 'YYYY-MM-DD') as date,
        coalesce(sum(daily_counts."visitorCount"), 0)::int as "visitorCount",
        coalesce(sum(daily_counts."registrationCount"), 0)::int as "registrationCount",
        coalesce(sum(daily_counts."conversionCount"), 0)::int as "conversionCount"
      from days
      left join daily_counts on daily_counts.day = days.day
      group by days.day
      order by days.day
    `);
    res.json(GetDeveloperOnlineCountResponse.parse({
      count: Number(result?.count ?? 0),
      activityWindowSeconds: ONLINE_WINDOW_SECONDS,
      registeredAccountCount: Number(result?.registeredAccountCount ?? 0),
      anonymousVisitorCount: Number(result?.anonymousVisitorCount ?? 0),
      dailyMetrics: dailyMetricsResult.rows.map((row) => ({
        date: row.date,
        visitorCount: Number(row.visitorCount),
        registrationCount: Number(row.registrationCount),
        conversionCount: Number(row.conversionCount),
      })),
    }));
  },
);

export default router;
