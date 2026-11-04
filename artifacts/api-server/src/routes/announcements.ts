import { and, eq, gt } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetActiveAnnouncementResponse,
  PublishAnnouncementBody,
  PublishAnnouncementResponse,
} from "@workspace/api-zod";
import { db, siteAnnouncementTable } from "@workspace/db";
import { requireDeveloperRank } from "../middlewares/accountSession";

const router: IRouter = Router();
const ACTIVE_ANNOUNCEMENT_ID = 1;
// The short cache coalesces polling bursts without keeping expired or replaced banners around.
const ACTIVE_ANNOUNCEMENT_CACHE_TTL_MS = 10_000;

type AnnouncementRow = typeof siteAnnouncementTable.$inferSelect;
type ActiveAnnouncement = AnnouncementRow | null;
type ActiveAnnouncementCache = {
  value: ActiveAnnouncement;
  validUntil: number;
};

let activeAnnouncementCache: ActiveAnnouncementCache | null = null;
let activeAnnouncementRequest: Promise<ActiveAnnouncement> | null = null;
let activeAnnouncementCacheRevision = 0;

function rememberActiveAnnouncement(value: ActiveAnnouncement): void {
  activeAnnouncementCacheRevision += 1;
  const now = Date.now();
  const expiresAt = value?.expiresAt.getTime() ?? now + ACTIVE_ANNOUNCEMENT_CACHE_TTL_MS;
  activeAnnouncementCache = {
    value,
    validUntil: Math.min(now + ACTIVE_ANNOUNCEMENT_CACHE_TTL_MS, expiresAt),
  };
}

async function findActiveAnnouncement(): Promise<ActiveAnnouncement> {
  const now = Date.now();
  if (activeAnnouncementCache && activeAnnouncementCache.validUntil > now) {
    return activeAnnouncementCache.value;
  }
  if (activeAnnouncementRequest) return activeAnnouncementRequest;

  const revisionAtStart = activeAnnouncementCacheRevision;
  const request = (async (): Promise<ActiveAnnouncement> => {
    const checkedAt = new Date();
    const [announcement] = await db
      .select()
      .from(siteAnnouncementTable)
      .where(and(
        eq(siteAnnouncementTable.id, ACTIVE_ANNOUNCEMENT_ID),
        gt(siteAnnouncementTable.expiresAt, checkedAt),
      ))
      .limit(1);
    const value = announcement ?? null;
    if (activeAnnouncementCacheRevision === revisionAtStart) {
      const fetchedAt = Date.now();
      const expiresAt = value?.expiresAt.getTime() ?? fetchedAt + ACTIVE_ANNOUNCEMENT_CACHE_TTL_MS;
      activeAnnouncementCache = {
        value,
        validUntil: Math.min(fetchedAt + ACTIVE_ANNOUNCEMENT_CACHE_TTL_MS, expiresAt),
      };
    }
    return value;
  })();

  activeAnnouncementRequest = request;
  try {
    return await request;
  } finally {
    if (activeAnnouncementRequest === request) activeAnnouncementRequest = null;
  }
}

router.get("/announcements/active", async (_req, res): Promise<void> => {
  const announcement = await findActiveAnnouncement();
  const remainingSeconds = announcement
    ? Math.max(0, Math.floor((announcement.expiresAt.getTime() - Date.now()) / 1000))
    : 5;
  const cacheSeconds = Math.min(5, remainingSeconds);
  res.setHeader("Cache-Control", `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`);
  res.json(GetActiveAnnouncementResponse.parse({ announcement }));
});

router.get("/announcements/stream", (_req, res): void => {
  // Keep old clients from holding open a request; they fall back to polling.
  res.setHeader("Cache-Control", "no-store");
  res.sendStatus(204);
});

router.post(
  "/announcements/active",
  requireDeveloperRank,
  async (req, res): Promise<void> => {
    const parsed = PublishAnnouncementBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter an announcement of up to 500 characters and a duration from 5 seconds to 3 days." });
      return;
    }

    const message = parsed.data.message.trim();
    if (!message || message.includes("\u0000")) {
      res.status(400).json({ error: "Enter a non-empty announcement message." });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsed.data.durationSeconds * 1000);
    const [announcement] = await db
      .insert(siteAnnouncementTable)
      .values({
        id: ACTIVE_ANNOUNCEMENT_ID,
        message,
        createdByUsername: req.studyDeskUser!.username,
        createdAt: now,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: siteAnnouncementTable.id,
        set: {
          message,
          createdByUsername: req.studyDeskUser!.username,
          createdAt: now,
          expiresAt,
        },
      })
      .returning();

    const result = PublishAnnouncementResponse.parse(announcement);
    rememberActiveAnnouncement(announcement ?? null);
    res.status(201).json(result);
  },
);

router.delete(
  "/announcements/active",
  requireDeveloperRank,
  async (_req, res): Promise<void> => {
    await db
      .delete(siteAnnouncementTable)
      .where(eq(siteAnnouncementTable.id, ACTIVE_ANNOUNCEMENT_ID));
    rememberActiveAnnouncement(null);
    res.sendStatus(204);
  },
);

export default router;
