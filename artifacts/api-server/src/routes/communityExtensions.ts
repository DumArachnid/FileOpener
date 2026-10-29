import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateCommunityExtensionBody,
  CreateCommunityExtensionResponse,
  DeleteCommunityExtensionParams,
  GetPublicExtensionParams,
  GetPublicExtensionResponse,
  ListMyExtensionsResponse,
  ListPublicExtensionsResponse,
  PublishCommunityExtensionParams,
  PublishCommunityExtensionResponse,
  ReportCommunityExtensionBody,
  ReportCommunityExtensionParams,
  ReportCommunityExtensionResponse,
  UpdateCommunityExtensionBody,
  UpdateCommunityExtensionParams,
  UpdateCommunityExtensionResponse,
} from "@workspace/api-zod";
import { communityExtensionReportsTable, communityExtensionsTable, db, studyUsersTable } from "@workspace/db";
import { authRateLimit } from "../middlewares/authRateLimit";
import { requireAccount } from "../middlewares/accountSession";
import { createReadRateLimit } from "../middlewares/readRateLimit";

const router: IRouter = Router();
const MAX_PER_ACCOUNT = 25;
const publicCatalogRateLimit = createReadRateLimit({
  limit: 30,
  windowMs: 60_000,
  message: "The extension catalog is being requested too often. Please wait a minute and try again.",
});
const publicExtensionRateLimit = createReadRateLimit({
  limit: 45,
  windowMs: 60_000,
  message: "Extension details are being requested too often. Please wait a minute and try again.",
});

function summary(row: {
  id: string;
  name: string;
  description: string;
  version: string;
  published: boolean;
  approvalStatus: string;
  moderationNote?: string | null;
  updatedAt: Date;
  username: string;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    publisherUsername: row.username,
    published: row.published,
    approvalStatus: row.approvalStatus,
    ...(row.moderationNote !== undefined ? { moderationNote: row.moderationNote } : {}),
    updatedAt: row.updatedAt,
  };
}

function validInput(input: { name: string; description: string; code: string }) {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    code: input.code,
  };
}

router.get("/store/extensions", publicCatalogRateLimit, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: communityExtensionsTable.id,
      name: communityExtensionsTable.name,
      description: communityExtensionsTable.description,
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
    .limit(100);
  res.json(ListPublicExtensionsResponse.parse(rows.map(summary)));
});

router.get("/store/extensions/:id", publicExtensionRateLimit, async (req, res): Promise<void> => {
  const params = GetPublicExtensionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid extension id." });
    return;
  }
  const [row] = await db
    .select({
      id: communityExtensionsTable.id,
      ownerId: communityExtensionsTable.ownerId,
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
    .where(eq(communityExtensionsTable.id, params.data.id))
    .limit(1);
  if (
    !row ||
    ((!row.published || row.approvalStatus !== "approved") &&
      row.ownerId !== req.studyDeskUser?.id)
  ) {
    res.status(404).json({ error: "Extension not found." });
    return;
  }
  res.json(
    GetPublicExtensionResponse.parse({
      ...summary({
        ...row,
        moderationNote: row.ownerId === req.studyDeskUser?.id ? row.moderationNote : undefined,
      }),
      code: row.code,
    }),
  );
});

router.post(
  "/store/extensions/:id/reports",
  authRateLimit,
  requireAccount,
  async (req, res): Promise<void> => {
    const params = ReportCommunityExtensionParams.safeParse(req.params);
    const parsed = ReportCommunityExtensionBody.safeParse(req.body);
    const reason = parsed.success ? parsed.data.reason.trim() : "";
    if (!params.success || !parsed.success || reason.length < 3) {
      res.status(400).json({ error: "Enter a short reason of at least 3 characters." });
      return;
    }

    const [extension] = await db
      .select({
        id: communityExtensionsTable.id,
        ownerId: communityExtensionsTable.ownerId,
      })
      .from(communityExtensionsTable)
      .where(
        and(
          eq(communityExtensionsTable.id, params.data.id),
          eq(communityExtensionsTable.published, true),
          eq(communityExtensionsTable.approvalStatus, "approved"),
        ),
      )
      .limit(1);
    if (!extension) {
      res.status(404).json({ error: "Published extension not found." });
      return;
    }
    if (extension.ownerId === req.studyDeskUser!.id) {
      res.status(409).json({ error: "You cannot report your own extension." });
      return;
    }

    const [report] = await db
      .insert(communityExtensionReportsTable)
      .values({
        extensionId: extension.id,
        reporterId: req.studyDeskUser!.id,
        reason,
      })
      .onConflictDoNothing()
      .returning();
    if (!report) {
      res.status(409).json({ error: "You have already reported this extension." });
      return;
    }
    res.status(201).json(ReportCommunityExtensionResponse.parse(report));
  },
);

router.get("/store/mine", requireAccount, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: communityExtensionsTable.id,
      name: communityExtensionsTable.name,
      description: communityExtensionsTable.description,
      version: communityExtensionsTable.version,
      published: communityExtensionsTable.published,
      approvalStatus: communityExtensionsTable.approvalStatus,
      moderationNote: communityExtensionsTable.moderationNote,
      updatedAt: communityExtensionsTable.updatedAt,
      username: studyUsersTable.username,
    })
    .from(communityExtensionsTable)
    .innerJoin(studyUsersTable, eq(communityExtensionsTable.ownerId, studyUsersTable.id))
    .where(eq(communityExtensionsTable.ownerId, req.studyDeskUser!.id))
    .orderBy(desc(communityExtensionsTable.updatedAt));
  res.json(ListMyExtensionsResponse.parse(rows.map(summary)));
});

router.post("/store/extensions", authRateLimit, requireAccount, async (req, res): Promise<void> => {
  const parsed = CreateCommunityExtensionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name, description, and JavaScript source under 200 KB." });
    return;
  }
  const input = validInput(parsed.data);
  if (!input.name || !input.description || !input.code.trim()) {
    res.status(400).json({ error: "Name, description, and source cannot be blank." });
    return;
  }

  const [ownedCount] = await db
    .select({ count: count() })
    .from(communityExtensionsTable)
    .where(eq(communityExtensionsTable.ownerId, req.studyDeskUser!.id));
  if (ownedCount.count >= MAX_PER_ACCOUNT) {
    res.status(429).json({ error: "Each account can keep up to 25 extensions." });
    return;
  }

  const [row] = await db
    .insert(communityExtensionsTable)
    .values({
      id: randomUUID(),
      ownerId: req.studyDeskUser!.id,
      ...input,
      published: false,
      approvalStatus: "draft",
    })
    .returning();
  res.status(201).json(
    CreateCommunityExtensionResponse.parse({
      ...summary({ ...row, username: req.studyDeskUser!.username }),
      code: row.code,
    }),
  );
});

router.patch("/store/extensions/:id", authRateLimit, requireAccount, async (req, res): Promise<void> => {
  const params = UpdateCommunityExtensionParams.safeParse(req.params);
  const parsed = UpdateCommunityExtensionBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Check the extension details and try again." });
    return;
  }
  const input = validInput(parsed.data);
  if (!input.name || !input.description || !input.code.trim()) {
    res.status(400).json({ error: "Name, description, and source cannot be blank." });
    return;
  }
  const [row] = await db
    .update(communityExtensionsTable)
    .set({
      ...input,
      published: false,
      approvalStatus: "draft",
      moderationNote: null,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communityExtensionsTable.id, params.data.id),
        eq(communityExtensionsTable.ownerId, req.studyDeskUser!.id),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Extension not found." });
    return;
  }
  res.json(
    UpdateCommunityExtensionResponse.parse({
      ...summary({ ...row, username: req.studyDeskUser!.username }),
      code: row.code,
    }),
  );
});

router.post("/store/extensions/:id/publish", authRateLimit, requireAccount, async (req, res): Promise<void> => {
  const params = PublishCommunityExtensionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid extension id." });
    return;
  }
  const [row] = await db
    .update(communityExtensionsTable)
    .set({
      published: true,
      approvalStatus: "pending",
      moderationNote: null,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communityExtensionsTable.id, params.data.id),
        eq(communityExtensionsTable.ownerId, req.studyDeskUser!.id),
      ),
    )
    .returning();
  if (!row) {
    res.status(404).json({ error: "Extension not found." });
    return;
  }
  res.json(
    PublishCommunityExtensionResponse.parse({
      ...summary({ ...row, username: req.studyDeskUser!.username }),
      code: row.code,
    }),
  );
});

router.delete("/store/extensions/:id", requireAccount, async (req, res): Promise<void> => {
  const params = DeleteCommunityExtensionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid extension id." });
    return;
  }
  const [deleted] = await db
    .delete(communityExtensionsTable)
    .where(
      and(
        eq(communityExtensionsTable.id, params.data.id),
        eq(communityExtensionsTable.ownerId, req.studyDeskUser!.id),
      ),
    )
    .returning({ id: communityExtensionsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Extension not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;
