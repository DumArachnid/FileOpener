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
      req.studyDeskUser = session;
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
