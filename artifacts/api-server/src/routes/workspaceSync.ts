import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetWorkspaceSyncResponse,
  UpdateWorkspaceSyncBody,
  UpdateWorkspaceSyncResponse,
} from "@workspace/api-zod";
import { db, workspaceSyncTable } from "@workspace/db";
import { requireAccount } from "../middlewares/accountSession";

const router: IRouter = Router();
const SYNCABLE_KEYS = new Set([
  "disguise_colors",
  "disguise_custom_fonts",
  "disguise_font",
  "disguise_main_font",
  "disguise_hotkey",
  "disguise_idle",
  "disguise_opacity",
  "disguise_options_hidden",
  "disguise_paniclink",
  "disguise_sidebar_order",
  "disguise_shortcuts",
  "disguise_tab_memory_limit",
  "disguise_theme",
  "disguise_timer_minutes",
  "disguise_title",
  "disguise_favicon",
  "disguise_blank_title",
  "disguise_notes",
  "disguise_bookmarks",
]);
const MAX_SYNC_BYTES = 512 * 1024;
const MAX_ITEM_BYTES = 120 * 1024;

router.get("/sync", requireAccount, async (req, res): Promise<void> => {
  const [record] = await db
    .select()
    .from(workspaceSyncTable)
    .where(eq(workspaceSyncTable.userId, req.studyDeskUser!.id))
    .limit(1);
  res.json(
    GetWorkspaceSyncResponse.parse({
      data: record?.data ?? {},
      revision: record?.revision ?? 0,
    }),
  );
});

router.patch("/sync", requireAccount, async (req, res): Promise<void> => {
  const parsed = UpdateWorkspaceSyncBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid sync data." });
    return;
  }

  const updates = parsed.data.updates;
  const keys = Object.keys(updates);
  if (keys.some((key) => !SYNCABLE_KEYS.has(key))) {
    res.status(400).json({ error: "This workspace field cannot be synced." });
    return;
  }
  if (
    keys.some(
      (key) =>
        updates[key] !== null &&
        Buffer.byteLength(updates[key] as string, "utf8") > MAX_ITEM_BYTES,
    ) ||
    Buffer.byteLength(JSON.stringify(updates), "utf8") > MAX_SYNC_BYTES
  ) {
    res.status(413).json({ error: "The sync update is too large." });
    return;
  }

  const values = Object.fromEntries(
    Object.entries(updates).filter((entry): entry is [string, string] => entry[1] !== null),
  );
  const removed = Object.entries(updates)
    .filter((entry) => entry[1] === null)
    .map(([key]) => key);
  const baseData = removed.length
    ? sql`(${workspaceSyncTable.data} - ARRAY[${sql.join(removed.map((key) => sql`${key}`), sql`, `)}]::text[])`
    : workspaceSyncTable.data;
  const mergedData = sql`${baseData} || ${JSON.stringify(values)}::jsonb`;

  const [record] = await db
    .insert(workspaceSyncTable)
    .values({ userId: req.studyDeskUser!.id, data: values })
    .onConflictDoUpdate({
      target: workspaceSyncTable.userId,
      set: {
        data: mergedData,
        revision: sql`${workspaceSyncTable.revision} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(
    UpdateWorkspaceSyncResponse.parse({
      data: record.data,
      revision: record.revision,
    }),
  );
});

export default router;
