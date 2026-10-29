import { and, eq, gt } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  GetActiveAnnouncementResponse,
  PublishAnnouncementBody,
  PublishAnnouncementResponse,
} from "@workspace/api-zod";
import { db, siteAnnouncementTable } from "@workspace/db";
import { requireDeveloperRank } from "../middlewares/accountSession";

const router: IRouter = Router();
const ACTIVE_ANNOUNCEMENT_ID = 1;
const announcementStreams = new Set<Response>();
let announcementRevision = 0;

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

function sendAnnouncement(response: Response, announcement: ActiveAnnouncement): void {
  if (response.destroyed || response.writableEnded) return;
  response.write(`data: ${JSON.stringify({ announcement })}\n\n`);
}

function broadcastAnnouncement(announcement: ActiveAnnouncement): void {
  announcementRevision += 1;
  for (const response of announcementStreams) sendAnnouncement(response, announcement);
}

router.get("/announcements/active", async (_req, res): Promise<void> => {
  const announcement = await findActiveAnnouncement();
  res.setHeader("Cache-Control", "no-store");
  res.json(GetActiveAnnouncementResponse.parse({ announcement }));
});

router.get("/announcements/stream", async (req, res): Promise<void> => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const initialRevision = announcementRevision;
  announcementStreams.add(res);
  res.write("retry: 3000\n\n");

  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n");
  }, 20_000);
  heartbeat.unref?.();
  res.on("close", () => {
    clearInterval(heartbeat);
    announcementStreams.delete(res);
  });
  try {
    const announcement = await findActiveAnnouncement();
    if (initialRevision === announcementRevision) sendAnnouncement(res, announcement);
  } catch (error) {
    req.log.error({ err: error }, "Could not load the active announcement for a stream");
    res.end();
  }
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
    broadcastAnnouncement(announcement);
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
    broadcastAnnouncement(null);
    res.sendStatus(204);
  },
);

export default router;
