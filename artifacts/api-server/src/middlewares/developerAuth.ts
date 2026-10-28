import type { RequestHandler } from "express";
import * as oidc from "openid-client";
import {
  DEVELOPER_SESSION_COOKIE,
  getAuthorizedDeveloperEmails,
  getDeveloperOidcConfig,
  getDeveloperSession,
  updateDeveloperSession,
  deleteDeveloperSession,
  type DeveloperSessionData,
} from "../lib/developerAuth";

async function refreshDeveloperSession(
  sid: string,
  session: DeveloperSessionData,
): Promise<DeveloperSessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;
  if (!session.refresh_token) return null;

  try {
    const config = await getDeveloperOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateDeveloperSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export const resolveDeveloperSession: RequestHandler = async (req, res, next) => {
  const sid = req.cookies?.[DEVELOPER_SESSION_COOKIE];
  if (typeof sid !== "string" || sid.length < 32 || sid.length > 128) {
    next();
    return;
  }

  try {
    const session = await getDeveloperSession(sid);
    if (!session?.user?.id || !session.user.email) {
      await deleteDeveloperSession(sid);
      res.clearCookie(DEVELOPER_SESSION_COOKIE, { path: "/", secure: true, sameSite: "lax" });
      next();
      return;
    }
    const refreshed = await refreshDeveloperSession(sid, session);
    if (!refreshed) {
      await deleteDeveloperSession(sid);
      res.clearCookie(DEVELOPER_SESSION_COOKIE, { path: "/", secure: true, sameSite: "lax" });
      next();
      return;
    }
    req.replitDeveloper = refreshed.user;
    req.replitDeveloperSessionId = sid;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuthorizedDeveloper: RequestHandler = (req, res, next) => {
  const allowedEmails = getAuthorizedDeveloperEmails();
  if (!allowedEmails.size) {
    res.status(503).json({ error: "Developer access is not configured." });
    return;
  }
  const email = req.replitDeveloper?.email?.trim().toLowerCase();
  if (!email) {
    res.status(401).json({ error: "Sign in with an authorized developer account." });
    return;
  }
  if (!allowedEmails.has(email)) {
    res.status(403).json({ error: "This Replit account is not authorized for developer controls." });
    return;
  }
  next();
};
