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

type AnnouncementRow = typeof siteAnnouncementTable.$inferSelect;
type ActiveAnnouncement = AnnouncementRow | null;

async function findActiveAnnouncement(): Promise<ActiveAnnouncement> {
  const [announcement] = await db
    .select()
    .from(siteAnnouncementTable)
    .where(and(
      eq(siteAnnouncementTable.id, ACTIVE_ANNOUNCEMENT_ID),
      gt(siteAnnouncementTable.expiresAt, new Date()),
    ))
    .limit(1);
  return announcement ?? null;
}

router.get("/announcements/active", async (_req, res): Promise<void> => {
  const announcement = await findActiveAnnouncement();
  res.setHeader("Cache-Control", "private, max-age=5");
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
    res.sendStatus(204);
  },
);

export default router;
