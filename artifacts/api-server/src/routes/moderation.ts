import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Router, type IRouter } from "express";
import {
  adminAuditTable,
  communityExtensionReportsTable,
  communityExtensionsTable,
  db,
  studySessionsTable,
  studyUsersTable,
} from "@workspace/db";
import {
  ListCommunityExtensionReportsResponse,
  ListRemovedModerationExtensionsResponse,
  RestoreCommunityExtensionParams,
  RestoreCommunityExtensionResponse,
  ReviewCommunityExtensionReportBody,
  ReviewCommunityExtensionReportParams,
  ReviewCommunityExtensionReportResponse,
} from "@workspace/api-zod";
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
    role: row.role === "moderator" || row.role === "dev" ? row.role : "user",
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

router.get(
  "/moderation/extensions/removed",
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
        moderationNote: communityExtensionsTable.moderationNote,
        updatedAt: communityExtensionsTable.updatedAt,
        username: studyUsersTable.username,
      })
      .from(communityExtensionsTable)
      .innerJoin(studyUsersTable, eq(communityExtensionsTable.ownerId, studyUsersTable.id))
      .where(
        and(
          eq(communityExtensionsTable.published, false),
          eq(communityExtensionsTable.approvalStatus, "removed"),
        ),
      )
      .orderBy(desc(communityExtensionsTable.updatedAt))
      .limit(100);
    res.json(
      ListRemovedModerationExtensionsResponse.parse(
        rows.map((row) => ({
          ...extensionSummary(row),
          moderationNote: row.moderationNote,
        })),
      ),
    );
  },
);

router.get(
  "/moderation/extension-reports",
  requireModerator,
  async (_req, res): Promise<void> => {
    const reporter = alias(studyUsersTable, "extension_reporter");
    const owner = alias(studyUsersTable, "extension_owner");
    const rows = await db
      .select({
        id: communityExtensionReportsTable.id,
        extensionId: communityExtensionsTable.id,
        name: communityExtensionsTable.name,
        description: communityExtensionsTable.description,
        code: communityExtensionsTable.code,
        version: communityExtensionsTable.version,
        publisherUsername: owner.username,
        published: communityExtensionsTable.published,
        approvalStatus: communityExtensionsTable.approvalStatus,
        reportReason: communityExtensionReportsTable.reason,
        reporterUsername: reporter.username,
        reportedAt: communityExtensionReportsTable.createdAt,
      })
      .from(communityExtensionReportsTable)
      .innerJoin(communityExtensionsTable, eq(communityExtensionReportsTable.extensionId, communityExtensionsTable.id))
      .innerJoin(owner, eq(communityExtensionsTable.ownerId, owner.id))
      .innerJoin(reporter, eq(communityExtensionReportsTable.reporterId, reporter.id))
      .where(eq(communityExtensionReportsTable.status, "open"))
      .orderBy(desc(communityExtensionReportsTable.createdAt))
      .limit(100);
    res.json(ListCommunityExtensionReportsResponse.parse(rows));
  },
);

router.post(
  "/moderation/extension-reports/:id/review",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = ReviewCommunityExtensionReportParams.safeParse(req.params);
    const parsed = ReviewCommunityExtensionReportBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Check the report review and try again." });
      return;
    }
    const now = new Date();
    const report = await db.transaction(async (tx) => {
      const [openReport] = await tx
        .select({
          id: communityExtensionReportsTable.id,
          extensionId: communityExtensionsTable.id,
          extensionName: communityExtensionsTable.name,
          ownerId: communityExtensionsTable.ownerId,
          ownerUsername: studyUsersTable.username,
          reason: communityExtensionReportsTable.reason,
        })
        .from(communityExtensionReportsTable)
        .innerJoin(communityExtensionsTable, eq(communityExtensionReportsTable.extensionId, communityExtensionsTable.id))
        .innerJoin(studyUsersTable, eq(communityExtensionsTable.ownerId, studyUsersTable.id))
        .where(
          and(
            eq(communityExtensionReportsTable.id, params.data.id),
            eq(communityExtensionReportsTable.status, "open"),
          ),
        )
        .limit(1)
        .for("update", { of: communityExtensionReportsTable });
      if (!openReport) return { error: "not-found" as const };
      if (parsed.data.action === "hide" && openReport.ownerId === req.studyDeskUser!.id) {
        return { error: "own-extension" as const };
      }

      const status = parsed.data.action === "hide" ? "actioned" : "dismissed";
      if (parsed.data.action === "hide") {
        const note = parsed.data.note?.trim() || "Removed after a community report.";
        await tx
          .update(communityExtensionsTable)
          .set({
            published: false,
            approvalStatus: "removed",
            moderationNote: note,
            reviewedAt: now,
            reviewedBy: req.studyDeskUser!.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(communityExtensionsTable.id, openReport.extensionId),
              eq(communityExtensionsTable.published, true),
              eq(communityExtensionsTable.approvalStatus, "approved"),
            ),
          );
        await tx
          .update(communityExtensionReportsTable)
          .set({ status, reviewedAt: now, reviewedBy: req.studyDeskUser!.id })
          .where(
            and(
              eq(communityExtensionReportsTable.extensionId, openReport.extensionId),
              eq(communityExtensionReportsTable.status, "open"),
            ),
          );
        await tx.insert(adminAuditTable).values({
          actorUsername: req.studyDeskUser!.username,
          targetUsername: openReport.ownerUsername,
          action: "extension.removed",
          reason: parsed.data.note?.trim() || openReport.reason,
          details: {
            extensionId: openReport.extensionId,
            extensionName: openReport.extensionName,
            reportId: openReport.id,
          },
        });
      } else {
        await tx
          .update(communityExtensionReportsTable)
          .set({ status, reviewedAt: now, reviewedBy: req.studyDeskUser!.id })
          .where(
            and(
              eq(communityExtensionReportsTable.id, openReport.id),
              eq(communityExtensionReportsTable.status, "open"),
            ),
          );
      }
      const [updated] = await tx
        .select()
        .from(communityExtensionReportsTable)
        .where(eq(communityExtensionReportsTable.id, openReport.id))
        .limit(1);
      return updated ? { report: updated } : { error: "not-found" as const };
    });
    if ("error" in report) {
      res.status(report.error === "own-extension" ? 409 : 404).json({
        error:
          report.error === "own-extension"
            ? "Moderators cannot review reports about their own extensions."
            : "Open report not found.",
      });
      return;
    }
    res.json(ReviewCommunityExtensionReportResponse.parse(report.report));
  },
);

router.post(
  "/moderation/extensions/:id/restore",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = RestoreCommunityExtensionParams.safeParse(req.params);
    if (!params.success || !UUID_RE.test(params.data.id)) {
      res.status(400).json({ error: "Invalid extension id." });
      return;
    }
    const [row] = await db
      .update(communityExtensionsTable)
      .set({
        published: true,
        approvalStatus: "approved",
        moderationNote: null,
        reviewedAt: new Date(),
        reviewedBy: req.studyDeskUser!.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(communityExtensionsTable.id, params.data.id),
          eq(communityExtensionsTable.published, false),
          eq(communityExtensionsTable.approvalStatus, "removed"),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Hidden extension not found." });
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
      action: "extension.restored",
      reason: "Extension restored to the public store.",
      details: { extensionId: row.id, extensionName: row.name },
    });
    res.json(RestoreCommunityExtensionResponse.parse({
      ...extensionSummary({ ...row, username: owner.username }),
      code: row.code,
      moderationNote: row.moderationNote,
    }));
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
