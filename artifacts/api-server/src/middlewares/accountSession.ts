import { and, eq, gt } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db, studySessionsTable, studyUsersTable } from "@workspace/db";
import { hashOpaqueValue, sessionCookieName } from "../lib/accountSecurity";

export const resolveAccountSession: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[sessionCookieName];
    if (typeof token !== "string" || token.length < 32 || token.length > 100) {
      next();
      return;
    }

    const tokenHash = hashOpaqueValue(token);
    const [session] = await db
      .select({
        id: studyUsersTable.id,
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
      })
      .from(studySessionsTable)
      .innerJoin(studyUsersTable, eq(studySessionsTable.userId, studyUsersTable.id))
      .where(
        and(
          eq(studySessionsTable.tokenHash, tokenHash),
          gt(studySessionsTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (session) {
      req.studyDeskUser = {
        ...session,
        role: session.role === "moderator" ? "moderator" : "user",
      };
      req.studyDeskSessionHash = tokenHash;
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAccount: RequestHandler = (req, res, next) => {
  if (!req.studyDeskUser) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (req.studyDeskUser.bannedAt) {
    res.status(403).json({ error: "This account is suspended." });
    return;
  }
  next();
};

export const requireModerator: RequestHandler = (req, res, next) => {
  if (!req.studyDeskUser) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (req.studyDeskUser.bannedAt || req.studyDeskUser.role !== "moderator") {
    res.status(403).json({ error: "Moderator access required." });
    return;
  }
  next();
};

export const sameOriginForWrites: RequestHandler = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }
  try {
    if (new URL(origin).host !== req.get("host")) {
      res.status(403).json({ error: "This request was not accepted." });
      return;
    }
  } catch {
    res.status(403).json({ error: "This request was not accepted." });
    return;
  }
  next();
};
