import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCurrentAccountAdminRewardGrantsResponse,
  GetModerationUserHistoryParams,
  GetModerationUserHistoryResponse,
  GetModerationUserSharedTabsParams,
  GetModerationUserSharedTabsResponse,
  GrantModerationUserRewardsBody,
  GrantModerationUserRewardsParams,
  GrantModerationUserRewardsResponse,
  PromoteModerationUserParams,
  PromoteModerationUserResponse,
  UnlockModerationUserFeaturesBody,
  UnlockModerationUserFeaturesParams,
  UnlockModerationUserFeaturesResponse,
} from "@workspace/api-zod";
import {
  adminAuditTable,
  adminRewardTotalsTable,
  db,
  studyUsersTable,
  workspaceSyncTable,
} from "@workspace/db";
import { requireAccount, requireModerator } from "../middlewares/accountSession";

const router: IRouter = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
const ALL_FEATURE_IDS = [
  "feature_calc",
  "feature_fonts",
  "feature_disguise",
  "feature_download",
  "feature_about_blank",
];

function normalizedUsername(value: unknown): string | null {
  if (typeof value !== "string" || !USERNAME_RE.test(value)) return null;
  return value.toLowerCase();
}

function sharedTabSummaries(value: unknown): Array<{ title: string; site: string }> {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (tab): tab is { title: string; site: string } =>
          typeof tab === "object" &&
          tab !== null &&
          typeof (tab as Record<string, unknown>).title === "string" &&
          typeof (tab as Record<string, unknown>).site === "string",
      )
      .slice(0, 12)
      .flatMap((tab) => {
        try {
          const parsed = new URL(`https://${tab.site}`);
          if (
            parsed.username ||
            parsed.password ||
            parsed.pathname !== "/" ||
            parsed.search ||
            parsed.hash ||
            !parsed.hostname
          ) return [];
          return [{
            title: tab.title.slice(0, 80),
            site: parsed.hostname.slice(0, 253),
          }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

router.post(
  "/moderation/users/:username/promote",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = PromoteModerationUserParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Enter an exact 3–24 character username." });
      return;
    }
    const username = normalizedUsername(params.data.username);
    if (!username) {
      res.status(400).json({ error: "Usernames may use letters, numbers, and underscores." });
      return;
    }
    const [target] = await db
      .select({
        id: studyUsersTable.id,
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
        banReason: studyUsersTable.banReason,
        createdAt: studyUsersTable.createdAt,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    if (target.id === req.studyDeskUser!.id || target.role !== "user" || target.bannedAt) {
      res.status(409).json({ error: "Only an active regular account can be promoted." });
      return;
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(studyUsersTable)
        .set({ role: "moderator" })
        .where(and(
          eq(studyUsersTable.id, target.id),
          eq(studyUsersTable.role, "user"),
          isNull(studyUsersTable.bannedAt),
        ))
        .returning({
          username: studyUsersTable.username,
          role: studyUsersTable.role,
          bannedAt: studyUsersTable.bannedAt,
          banReason: studyUsersTable.banReason,
          createdAt: studyUsersTable.createdAt,
        });
      if (!row) return null;
      await tx.insert(adminAuditTable).values({
        actorUsername: req.studyDeskUser!.username,
        targetUsername: target.username,
        action: "user.promoted",
        reason: null,
        details: { role: "moderator" },
      });
      return row;
    });
    if (!updated) {
      res.status(409).json({ error: "The account changed before it could be promoted." });
      return;
    }
    res.json(PromoteModerationUserResponse.parse({
      username: updated.username,
      role: updated.role === "moderator" ? "moderator" : "user",
      banned: updated.bannedAt !== null,
      createdAt: updated.createdAt,
      banReason: updated.banReason,
    }));
  },
);

router.post(
  "/moderation/users/:username/rewards",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = GrantModerationUserRewardsParams.safeParse(req.params);
    const body = GrantModerationUserRewardsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Check the account, reward amount, and reason." });
      return;
    }
    const username = normalizedUsername(params.data.username);
    const reason = body.data.reason.trim();
    if (!username || !reason) {
      res.status(400).json({ error: "Enter a valid username and a reason for the reward." });
      return;
    }
    const [target] = await db
      .select({ id: studyUsersTable.id, username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    if (target.id === req.studyDeskUser!.id) {
      res.status(409).json({ error: "Admins cannot grant rewards to their own account." });
      return;
    }
    const { currency, amount } = body.data;
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(adminRewardTotalsTable)
        .where(eq(adminRewardTotalsTable.userId, target.id))
        .limit(1)
        .for("update");
      if ((existing?.[currency] ?? 0) + amount > 1_000_000) return null;
      const [totals] = await tx
        .insert(adminRewardTotalsTable)
        .values({
          userId: target.id,
          points: currency === "points" ? amount : 0,
          shards: currency === "shards" ? amount : 0,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: adminRewardTotalsTable.userId,
          set: {
            points: currency === "points"
              ? sql`${adminRewardTotalsTable.points} + ${amount}`
              : adminRewardTotalsTable.points,
            shards: currency === "shards"
              ? sql`${adminRewardTotalsTable.shards} + ${amount}`
              : adminRewardTotalsTable.shards,
            updatedAt: now,
          },
        })
        .returning({
          points: adminRewardTotalsTable.points,
          shards: adminRewardTotalsTable.shards,
        });
      await tx.insert(adminAuditTable).values({
        actorUsername: req.studyDeskUser!.username,
        targetUsername: target.username,
        action: "reward.granted",
        reason,
        details: { currency, amount },
      });
      return totals;
    });
    if (!result) {
      res.status(409).json({ error: "This account has reached the reward limit for that currency." });
      return;
    }
    res.json(GrantModerationUserRewardsResponse.parse({
      username: target.username,
      points: result.points,
      shards: result.shards,
    }));
  },
);

router.post(
  "/moderation/users/:username/unlock-all",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = UnlockModerationUserFeaturesParams.safeParse(req.params);
    const body = UnlockModerationUserFeaturesBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Check the account and unlock reason." });
      return;
    }
    const username = normalizedUsername(params.data.username);
    const reason = body.data.reason.trim();
    if (!username || !reason) {
      res.status(400).json({ error: "Enter a valid username and reason." });
      return;
    }
    const [target] = await db
      .select({ id: studyUsersTable.id, username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    if (target.id === req.studyDeskUser!.id) {
      res.status(409).json({ error: "Admins cannot grant all feature unlocks to their own account." });
      return;
    }

    const [existingGrant] = await db
      .select({ id: adminAuditTable.id })
      .from(adminAuditTable)
      .where(and(
        eq(adminAuditTable.targetUsername, target.username),
        eq(adminAuditTable.action, "features.unlocked"),
      ))
      .limit(1);
    if (!existingGrant) {
      await db.insert(adminAuditTable).values({
        actorUsername: req.studyDeskUser!.username,
        targetUsername: target.username,
        action: "features.unlocked",
        reason,
        details: { unlockedFeatures: ALL_FEATURE_IDS },
      });
    }
    res.json(UnlockModerationUserFeaturesResponse.parse({
      username: target.username,
      unlockedFeatures: ALL_FEATURE_IDS,
    }));
  },
);

router.get(
  "/moderation/users/:username/history",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = GetModerationUserHistoryParams.safeParse(req.params);
    const username = params.success ? normalizedUsername(params.data.username) : null;
    if (!username) {
      res.status(400).json({ error: "Enter a valid account username." });
      return;
    }
    const [target] = await db
      .select({ username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    const rows = await db
      .select()
      .from(adminAuditTable)
      .where(eq(adminAuditTable.targetUsername, target.username))
      .orderBy(desc(adminAuditTable.createdAt))
      .limit(100);
    res.json(GetModerationUserHistoryResponse.parse(rows));
  },
);

router.get(
  "/moderation/users/:username/tabs",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = GetModerationUserSharedTabsParams.safeParse(req.params);
    const username = params.success ? normalizedUsername(params.data.username) : null;
    if (!username) {
      res.status(400).json({ error: "Enter a valid account username." });
      return;
    }
    const [target] = await db
      .select({ id: studyUsersTable.id, username: studyUsersTable.username })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "No account found with that username." });
      return;
    }
    const [sync] = await db
      .select({ data: workspaceSyncTable.data })
      .from(workspaceSyncTable)
      .where(eq(workspaceSyncTable.userId, target.id))
      .limit(1);
    const shared = sync?.data?.disguise_admin_tab_sharing === "true";
    const tabs = shared ? sharedTabSummaries(sync?.data?.disguise_shared_tabs) : [];
    res.json(GetModerationUserSharedTabsResponse.parse({ shared, tabs }));
  },
);

router.get(
  "/rewards/admin-grants",
  requireAccount,
  async (req, res): Promise<void> => {
    const [totals] = await db
      .select({
        points: adminRewardTotalsTable.points,
        shards: adminRewardTotalsTable.shards,
      })
      .from(adminRewardTotalsTable)
      .where(eq(adminRewardTotalsTable.userId, req.studyDeskUser!.id))
      .limit(1);
    const [featureGrant] = await db
      .select({ id: adminAuditTable.id })
      .from(adminAuditTable)
      .where(and(
        eq(adminAuditTable.targetUsername, req.studyDeskUser!.username),
        eq(adminAuditTable.action, "features.unlocked"),
      ))
      .limit(1);
    res.json(GetCurrentAccountAdminRewardGrantsResponse.parse({
      points: totals?.points ?? 0,
      shards: totals?.shards ?? 0,
      allFeaturesUnlocked: !!featureGrant,
    }));
  },
);

export default router;
