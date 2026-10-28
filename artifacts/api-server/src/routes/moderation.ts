import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { adminAuditTable, communityExtensionsTable, db, studySessionsTable, studyUsersTable } from "@workspace/db";
import { requireModerator } from "../middlewares/accountSession";

const router: IRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReviewBody(value: unknown): { decision: "approve" | "reject"; note?: string } | null {
  if (!isRecord(value) || (value.decision !== "approve" && value.decision !== "reject")) return null;
  if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 500)) return null;
  return {
    decision: value.decision,
    ...(typeof value.note === "string" ? { note: value.note } : {}),
  };
}

function parseBanBody(value: unknown): { banned: boolean; reason?: string } | null {
  if (!isRecord(value) || typeof value.banned !== "boolean") return null;
  if (value.reason !== undefined && (typeof value.reason !== "string" || value.reason.length > 500)) return null;
  return {
    banned: value.banned,
    ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
  };
}

function parseTakedownBody(value: unknown): { reason: string } | null {
  if (!isRecord(value) || typeof value.reason !== "string" || value.reason.length > 500) return null;
  const reason = value.reason.trim();
  return reason ? { reason } : null;
}

function extensionSummary(row: {
  id: string;
  name: string;
  description: string;
  code: string;
  version: string;
  published: boolean;
  approvalStatus: string;
  updatedAt: Date;
  username: string;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    code: row.code,
    version: row.version,
    publisherUsername: row.username,
    published: row.published,
    approvalStatus: row.approvalStatus,
    updatedAt: row.updatedAt,
  };
}

function userSummary(row: {
  username: string;
  role: string;
  bannedAt: Date | null;
  banReason: string | null;
  createdAt: Date;
}) {
  return {
    username: row.username,
    role: row.role === "moderator" ? "moderator" : "user",
    banned: row.bannedAt !== null,
    createdAt: row.createdAt,
    banReason: row.banReason,
  };
}

router.get(
  "/moderation/extensions",
  requireModerator,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        id: communityExtensionsTable.id,
        name: communityExtensionsTable.name,
        description: communityExtensionsTable.description,
        code: communityExtensionsTable.code,
        version: communityExtensionsTable.version,
        published: communityExtensionsTable.published,
        approvalStatus: communityExtensionsTable.approvalStatus,
        updatedAt: communityExtensionsTable.updatedAt,
        username: studyUsersTable.username,
      })
      .from(communityExtensionsTable)
      .innerJoin(studyUsersTable, eq(communityExtensionsTable.ownerId, studyUsersTable.id))
      .where(
        and(
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "pending"),
        ),
      )
      .orderBy(desc(communityExtensionsTable.updatedAt))
      .limit(25);
    res.json(rows.map(extensionSummary));
  },
);

router.post(
  "/moderation/extensions/:id/takedown",
  requireModerator,
  async (req, res): Promise<void> => {
    const id = req.params.id;
    const body = parseTakedownBody(req.body);
    if (typeof id !== "string" || !UUID_RE.test(id) || !body) {
      res.status(400).json({ error: "Enter a reason for removing this extension from the public store." });
      return;
    }
    const [row] = await db
      .update(communityExtensionsTable)
      .set({
        published: false,
        approvalStatus: "removed",
        moderationNote: body.reason,
        reviewedAt: new Date(),
        reviewedBy: req.studyDeskUser!.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityExtensionsTable.id, id),
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "approved"),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Published extension not found." });
      return;
    }
    const [owner] = await db
      .select({ username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.id, row.ownerId))
      .limit(1);
    if (!owner) {
      res.status(404).json({ error: "Extension owner not found." });
      return;
    }
    await db.insert(adminAuditTable).values({
      actorUsername: req.studyDeskUser!.username,
      targetUsername: owner.username,
      action: "extension.removed",
      reason: body.reason,
      details: { extensionId: row.id, extensionName: row.name },
    });
    res.json(extensionSummary({ ...row, username: owner.username }));
  },
);

router.get(
  "/moderation/extensions/published",
  requireModerator,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select({
        id: communityExtensionsTable.id,
        name: communityExtensionsTable.name,
        description: communityExtensionsTable.description,
        code: communityExtensionsTable.code,
        version: communityExtensionsTable.version,
        published: communityExtensionsTable.published,
        approvalStatus: communityExtensionsTable.approvalStatus,
        updatedAt: communityExtensionsTable.updatedAt,
        username: studyUsersTable.username,
      })
      .from(communityExtensionsTable)
      .innerJoin(studyUsersTable, eq(communityExtensionsTable.ownerId, studyUsersTable.id))
      .where(
        and(
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "approved"),
        ),
      )
      .orderBy(desc(communityExtensionsTable.updatedAt))
      .limit(25);
    res.json(rows.map(extensionSummary));
  },
);

router.post(
  "/moderation/extensions/:id/review",
  requireModerator,
  async (req, res): Promise<void> => {
    const id = req.params.id;
    const body = parseReviewBody(req.body);
    if (typeof id !== "string" || !UUID_RE.test(id) || !body) {
      res.status(400).json({ error: "Check the extension review and try again." });
      return;
    }
    const note = body.note?.trim() || null;
    const approved = body.decision === "approve";
    const [pending] = await db
      .select({ ownerId: communityExtensionsTable.ownerId })
      .from(communityExtensionsTable)
      .where(
        and(
          eq(communityExtensionsTable.id, id),
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "pending"),
        ),
      )
      .limit(1);
    if (!pending) {
      res.status(404).json({ error: "Pending extension not found." });
      return;
    }
    if (pending.ownerId === req.studyDeskUser!.id) {
      res.status(409).json({ error: "Moderators cannot approve or reject their own submissions." });
      return;
    }
    const [row] = await db
      .update(communityExtensionsTable)
      .set({
        published: approved,
        approvalStatus: approved ? "approved" : "rejected",
        moderationNote: note,
        reviewedAt: new Date(),
        reviewedBy: req.studyDeskUser!.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityExtensionsTable.id, id),
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "pending"),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Pending extension not found." });
      return;
    }
    const [owner] = await db
      .select({ username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.id, row.ownerId))
      .limit(1);
    if (!owner) {
      res.status(404).json({ error: "Extension owner not found." });
      return;
    }
    await db.insert(adminAuditTable).values({
      actorUsername: req.studyDeskUser!.username,
      targetUsername: owner.username,
      action: approved ? "extension.approved" : "extension.rejected",
      reason: note,
      details: { extensionId: row.id, extensionName: row.name },
    });
    res.json(extensionSummary({ ...row, username: owner.username }));
  },
);

router.get(
  "/moderation/users",
  requireModerator,
  async (req, res): Promise<void> => {
    const username = req.query.username;
    if (typeof username !== "string" || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: "Enter an exact username to search." });
      return;
    }
    const [row] = await db
      .select({
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
        banReason: studyUsersTable.banReason,
        createdAt: studyUsersTable.createdAt,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username.toLowerCase()))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    res.json(userSummary(row));
  },
);

router.patch(
  "/moderation/users/:username/ban",
  requireModerator,
  async (req, res): Promise<void> => {
    const username = req.params.username;
    const body = parseBanBody(req.body);
    if (typeof username !== "string" || !USERNAME_RE.test(username) || !body) {
      res.status(400).json({ error: "Check the username and ban details." });
      return;
    }
    const normalizedUsername = username.toLowerCase();
    const [target] = await db
      .select({
        id: studyUsersTable.id,
        role: studyUsersTable.role,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, normalizedUsername))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    if (target.id === req.studyDeskUser!.id || target.role !== "user") {
      res.status(409).json({ error: "Moderators cannot ban their own account or another moderator." });
      return;
    }

    const now = new Date();
    const updatedUser = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(studyUsersTable)
        .set({
          bannedAt: body.banned ? now : null,
          banReason: body.banned ? body.reason?.trim() || null : null,
        })
        .where(eq(studyUsersTable.id, target.id))
        .returning({
          username: studyUsersTable.username,
          role: studyUsersTable.role,
          bannedAt: studyUsersTable.bannedAt,
          banReason: studyUsersTable.banReason,
          createdAt: studyUsersTable.createdAt,
        });
      if (body.banned) {
        await tx.delete(studySessionsTable).where(eq(studySessionsTable.userId, target.id));
      }
      await tx.insert(adminAuditTable).values({
        actorUsername: req.studyDeskUser!.username,
        targetUsername: normalizedUsername,
        action: body.banned ? "user.banned" : "user.restored",
        reason: body.banned ? body.reason?.trim() || null : null,
        details: {},
      });
      return updated;
    });
    if (!updatedUser) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    res.json(userSummary(updatedUser));
  },
);

export default router;
