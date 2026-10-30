import { createHash, randomBytes } from "node:crypto";
import { desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCuratedRandomLinkBody,
  CreateCuratedRandomLinkResponse,
  DeleteCuratedRandomLinkParams,
  GetRandomCuratedLinkResponse,
  ListCuratedRandomLinksResponse,
  UpdateCuratedRandomLinkBody,
  UpdateCuratedRandomLinkParams,
  UpdateCuratedRandomLinkResponse,
} from "@workspace/api-zod";
import { db, randomLinkClaimsTable, randomLinksTable } from "@workspace/db";
import { requireModerator } from "../middlewares/accountSession";
import { createReadRateLimit } from "../middlewares/readRateLimit";

const router: IRouter = Router();
const randomLinkRateLimit = createReadRateLimit({
  limit: 30,
  windowMs: 60_000,
  message: "Random links are being requested too often. Please try again in a minute.",
});
const MAX_CATALOG_SIZE = 500;
const RANDOM_LINK_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const RANDOM_LINK_LIMIT = 2;
const RANDOM_LINK_VISITOR_COOKIE = "study_desk_random_link_visitor";

function getRandomLinkIdentity(req: Request, res: Response): string {
  if (req.studyDeskUser) return `account:${req.studyDeskUser.id}`;

  let visitorToken = req.cookies?.[RANDOM_LINK_VISITOR_COOKIE];
  if (typeof visitorToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(visitorToken)) {
    visitorToken = randomBytes(32).toString("base64url");
    const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    res.cookie(RANDOM_LINK_VISITOR_COOKIE, visitorToken, {
      httpOnly: true,
      secure: req.secure || forwardedProtocol === "https",
      sameSite: "lax",
      path: "/api/random-links",
      maxAge: 365 * 24 * 60 * 60 * 1000,
    });
  }

  const visitorHash = createHash("sha256").update(visitorToken).digest("hex");
  return `visitor:${visitorHash}`;
}

function normalizeInput(input: { title: string; url: string; enabled: boolean }) {
  const title = input.title.trim();
  if (!title || title.includes("\u0000")) return null;

  try {
    const parsed = new URL(input.url.trim());
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) return null;
    const url = parsed.toString();
    if (url.length > 2048) return null;
    return { title, url, enabled: input.enabled };
  } catch {
    return null;
  }
}

function parseId(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function hasErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === code) return true;
    current = candidate.cause;
  }
  return false;
}

router.get("/random-links/random", randomLinkRateLimit, async (req, res): Promise<void> => {
  const identityKey = getRandomLinkIdentity(req, res);
  const [link] = await db
    .select({
      id: randomLinksTable.id,
      title: randomLinksTable.title,
      url: randomLinksTable.url,
    })
    .from(randomLinksTable)
    .where(eq(randomLinksTable.enabled, true))
    .orderBy(sql`random()`)
    .limit(1);
  res.setHeader("Cache-Control", "no-store");
  if (!link) {
    res.json(GetRandomCuratedLinkResponse.parse({ link: null }));
    return;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - RANDOM_LINK_COOLDOWN_MS);
  // The unsuffixed identity key remains the first slot, preserving existing
  // one-claim records. A second slot allows one additional request per window.
  const claimKeys = [identityKey, `${identityKey}:slot:2`];
  let claim: { lastClaimedAt: Date } | undefined;
  for (const claimKey of claimKeys) {
    const [slotClaim] = await db
      .insert(randomLinkClaimsTable)
      .values({ identityKey: claimKey, lastClaimedAt: now })
      .onConflictDoUpdate({
        target: randomLinkClaimsTable.identityKey,
        set: { lastClaimedAt: now },
        setWhere: sql`${randomLinkClaimsTable.lastClaimedAt} <= ${cutoff}`,
      })
      .returning({ lastClaimedAt: randomLinkClaimsTable.lastClaimedAt });
    if (slotClaim) {
      claim = slotClaim;
      break;
    }
  }

  const claims = await db
      .select({ lastClaimedAt: randomLinkClaimsTable.lastClaimedAt })
      .from(randomLinkClaimsTable)
      .where(inArray(randomLinkClaimsTable.identityKey, claimKeys));
  const activeClaims = claims
    .map((row) => row.lastClaimedAt)
    .filter((claimedAt) => claimedAt.getTime() > cutoff.getTime());

  if (!claim) {
    const oldestClaim = activeClaims.reduce(
      (oldest, claimedAt) => Math.min(oldest, claimedAt.getTime()),
      now.getTime(),
    );
    const nextAvailableAt = new Date(oldestClaim + RANDOM_LINK_COOLDOWN_MS);
    const retryAfterSeconds = Math.max(1, Math.ceil((nextAvailableAt.getTime() - now.getTime()) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.setHeader("X-Random-Link-Next-Available-At", nextAvailableAt.toISOString());
    res.status(429).json({
      error: `You have already received ${RANDOM_LINK_LIMIT} random links in the last 24 hours.`,
      dailyLimit: true,
      availableAt: nextAvailableAt.toISOString(),
      retryAfterSeconds,
    });
    return;
  }

  if (activeClaims.length >= RANDOM_LINK_LIMIT) {
    const oldestClaim = Math.min(...activeClaims.map((claimedAt) => claimedAt.getTime()));
    const nextAvailableAt = new Date(oldestClaim + RANDOM_LINK_COOLDOWN_MS);
    res.setHeader("X-Random-Link-Next-Available-At", nextAvailableAt.toISOString());
  }
  res.json(GetRandomCuratedLinkResponse.parse({ link }));
});

router.get(
  "/moderation/random-links",
  requireModerator,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(randomLinksTable)
      .orderBy(desc(randomLinksTable.createdAt), desc(randomLinksTable.id))
      .limit(MAX_CATALOG_SIZE);
    res.setHeader("Cache-Control", "no-store");
    res.json(ListCuratedRandomLinksResponse.parse(rows));
  },
);

router.post(
  "/moderation/random-links",
  requireModerator,
  async (req, res): Promise<void> => {
    const body = CreateCuratedRandomLinkBody.safeParse(req.body);
    const input = body.success ? normalizeInput(body.data) : null;
    if (!body.success || !input) {
      res.status(400).json({ error: "Enter a title and a valid HTTP or HTTPS link without a username or password." });
      return;
    }

    const [existing] = await db
      .select({ id: randomLinksTable.id })
      .from(randomLinksTable)
      .where(eq(randomLinksTable.url, input.url))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "That link is already in the catalog." });
      return;
    }

    try {
      const [row] = await db
        .insert(randomLinksTable)
        .values({ ...input, updatedAt: new Date() })
        .returning();
      res.status(201).json(CreateCuratedRandomLinkResponse.parse(row));
    } catch (error) {
      if (hasErrorCode(error, "23505")) {
        res.status(409).json({ error: "That link is already in the catalog." });
        return;
      }
      throw error;
    }
  },
);

router.patch(
  "/moderation/random-links/:id",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = UpdateCuratedRandomLinkParams.safeParse(req.params);
    const body = UpdateCuratedRandomLinkBody.safeParse(req.body);
    const id = params.success ? parseId(params.data.id) : null;
    const input = body.success ? normalizeInput(body.data) : null;
    if (id === null || !body.success || !input) {
      res.status(400).json({ error: "Check the link ID, title, and valid HTTP or HTTPS address." });
      return;
    }

    const [duplicate] = await db
      .select({ id: randomLinksTable.id })
      .from(randomLinksTable)
      .where(eq(randomLinksTable.url, input.url))
      .limit(1);
    if (duplicate && duplicate.id !== id) {
      res.status(409).json({ error: "That link is already in the catalog." });
      return;
    }

    try {
      const [row] = await db
        .update(randomLinksTable)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(randomLinksTable.id, id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "That curated link was not found." });
        return;
      }
      res.json(UpdateCuratedRandomLinkResponse.parse(row));
    } catch (error) {
      if (hasErrorCode(error, "23505")) {
        res.status(409).json({ error: "That link is already in the catalog." });
        return;
      }
      throw error;
    }
  },
);

router.delete(
  "/moderation/random-links/:id",
  requireModerator,
  async (req, res): Promise<void> => {
    const params = DeleteCuratedRandomLinkParams.safeParse(req.params);
    const id = params.success ? parseId(params.data.id) : null;
    if (id === null) {
      res.status(400).json({ error: "Enter a valid curated-link ID." });
      return;
    }
    const [row] = await db
      .delete(randomLinksTable)
      .where(eq(randomLinksTable.id, id))
      .returning({ id: randomLinksTable.id });
    if (!row) {
      res.status(404).json({ error: "That curated link was not found." });
      return;
    }
    res.status(204).end();
  },
);

export default router;
