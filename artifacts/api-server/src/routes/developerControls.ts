import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  FindDeveloperManagedAccountQueryParams,
  FindDeveloperManagedAccountResponse,
  GetDeveloperAuthStateResponse,
  CreateDeveloperStudyDeskSessionResponse,
  SetDeveloperManagedAccountRoleBody,
  SetDeveloperManagedAccountRoleParams,
  SetDeveloperManagedAccountRoleResponse,
} from "@workspace/api-zod";
import {
  db,
  studySessionsTable,
  studyUsersTable,
} from "@workspace/db";
import * as oidc from "openid-client";
import {
  createDeveloperSession,
  deleteDeveloperSession,
  DEVELOPER_SESSION_COOKIE,
  DEVELOPER_SESSION_TTL_MS,
  getDeveloperAccountMappings,
  getAuthorizedDeveloperEmails,
  getDeveloperOidcConfig,
  isAuthorizedDeveloperEmail,
  REPLIT_ISSUER_URL,
  upsertReplitDeveloper,
} from "../lib/developerAuth";
import { requireAuthorizedDeveloper } from "../middlewares/developerAuth";
import {
  hashOpaqueValue,
  newSessionToken,
  sessionTtlMs,
  setSessionCookie,
} from "../lib/accountSecurity";

const router: IRouter = Router();
const OIDC_COOKIE_TTL_MS = 10 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

function getOrigin(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost")
    .split(",")[0]
    .trim();
  return `${proto}://${host}`;
}

function setSecureCookie(res: Response, name: string, value: string, maxAge: number): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

function clearOidcCookies(res: Response): void {
  for (const name of ["study_desk_dev_state", "study_desk_dev_nonce", "study_desk_dev_verifier", "study_desk_dev_return_to"]) {
    res.clearCookie(name, { path: "/", secure: true, sameSite: "lax" });
  }
}

function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const target = new URL(value, "https://study-desk.invalid");
    if (target.origin !== "https://study-desk.invalid") return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function completionPath(returnTo: string, error: "unauthorized" | "failed"): string {
  const target = new URL(returnTo, "https://study-desk.invalid");
  target.searchParams.set("developerAuthError", error);
  return `${target.pathname}${target.search}${target.hash}`;
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

router.get("/developer/auth/user", (req, res): void => {
  const user = req.replitDeveloper;
  res.json(
    GetDeveloperAuthStateResponse.parse({
      user: user
        ? {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
          }
        : null,
      authorized: user ? isAuthorizedDeveloperEmail(user.email) : false,
    }),
  );
});

router.post(
  "/developer/auth/study-desk-session",
  requireAuthorizedDeveloper,
  async (req, res): Promise<void> => {
    const developer = req.replitDeveloper;
    if (!developer || developer.emailVerified !== true) {
      res.status(403).json({ error: "Sign in again with a verified developer email." });
      return;
    }

    const username = getDeveloperAccountMappings().get(developer.email.trim().toLowerCase());
    if (!username) {
      res.status(403).json({ error: "This authorized developer identity is not linked to a Study Desk account." });
      return;
    }

    const [user] = await db
      .select({
        id: studyUsersTable.id,
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "The linked Study Desk account was not found." });
      return;
    }
    if (user.bannedAt) {
      res.status(403).json({ error: "The linked Study Desk account is suspended." });
      return;
    }

    const token = newSessionToken();
    await db.insert(studySessionsTable).values({
      tokenHash: hashOpaqueValue(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + sessionTtlMs),
    });
    setSessionCookie(res, token);
    res.json(CreateDeveloperStudyDeskSessionResponse.parse({
      user: { username: user.username, role: user.role },
    }));
  },
);

router.get("/developer/login", async (req, res): Promise<void> => {
  if (!getAuthorizedDeveloperEmails().size) {
    res.status(503).send("Developer sign-in is not configured.");
    return;
  }
  const config = await getDeveloperOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/developer/callback`;
  const returnTo = safeReturnTo(req.query.returnTo);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setSecureCookie(res, "study_desk_dev_state", state, OIDC_COOKIE_TTL_MS);
  setSecureCookie(res, "study_desk_dev_nonce", nonce, OIDC_COOKIE_TTL_MS);
  setSecureCookie(res, "study_desk_dev_verifier", codeVerifier, OIDC_COOKIE_TTL_MS);
  setSecureCookie(res, "study_desk_dev_return_to", returnTo, OIDC_COOKIE_TTL_MS);
  res.redirect(url.href);
});

router.get("/developer/callback", async (req, res): Promise<void> => {
  const origin = getOrigin(req);
  const callbackUrl = `${origin}/api/developer/callback`;
  const codeVerifier = req.cookies?.study_desk_dev_verifier;
  const nonce = req.cookies?.study_desk_dev_nonce;
  const expectedState = req.cookies?.study_desk_dev_state;
  const returnTo = safeReturnTo(req.cookies?.study_desk_dev_return_to);

  if (!codeVerifier || !nonce || !expectedState) {
    clearOidcCookies(res);
    res.redirect("/api/developer/auth/complete?developerAuthError=failed");
    return;
  }

  try {
    const config = await getDeveloperOidcConfig();
    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );
    const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== "string" || typeof claims.email !== "string") {
      clearOidcCookies(res);
      res.redirect(completionPath(returnTo, "failed"));
      return;
    }
    if (claims.email_verified === false) {
      clearOidcCookies(res);
      res.redirect(completionPath(returnTo, "failed"));
      return;
    }
    if (!isAuthorizedDeveloperEmail(claims.email)) {
      clearOidcCookies(res);
      res.redirect(completionPath(returnTo, "unauthorized"));
      return;
    }

    const developer = await upsertReplitDeveloper(claims as unknown as Record<string, unknown>);
    const now = Math.floor(Date.now() / 1000);
    const sessionId = await createDeveloperSession({
      user: developer,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    });
    setSecureCookie(res, DEVELOPER_SESSION_COOKIE, sessionId, DEVELOPER_SESSION_TTL_MS);
    clearOidcCookies(res);
    res.redirect(returnTo);
  } catch (error) {
    clearOidcCookies(res);
    req.log.warn(
      { errorName: error instanceof Error ? error.name : "Error" },
      "Developer sign-in failed",
    );
    res.redirect(completionPath(returnTo, "failed"));
  }
});

router.get("/developer/logout", async (req, res): Promise<void> => {
  const sessionId = req.cookies?.[DEVELOPER_SESSION_COOKIE];
  if (typeof sessionId === "string") await deleteDeveloperSession(sessionId);
  res.clearCookie(DEVELOPER_SESSION_COOKIE, { path: "/", secure: true, sameSite: "lax" });
  res.redirect(safeReturnTo(req.query.returnTo));
});

router.get("/developer/auth/complete", (req, res): void => {
  const authError = req.query.developerAuthError;
  const error = authError === "unauthorized" || authError === "failed"
    ? JSON.stringify(authError)
    : "null";
  const message = error === "null"
    ? "Sign-in complete. You can close this window."
    : "Developer sign-in could not be completed.";
  res.type("html").send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Developer sign-in</title></head><body><p>${message}</p><a href="/">Return to Study Desk</a><script>try{if(window.opener){window.opener.postMessage({type:"study-desk-developer-auth",error:${error}},window.location.origin);}}catch(e){}window.close();</script></body></html>`,
  );
});

router.get(
  "/developer/accounts",
  requireAuthorizedDeveloper,
  async (req, res): Promise<void> => {
    const parsed = FindDeveloperManagedAccountQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter an exact 3–24 character username." });
      return;
    }
    const username = parsed.data.username.toLowerCase();
    if (!USERNAME_RE.test(username)) {
      res.status(400).json({ error: "Usernames may use letters, numbers, and underscores." });
      return;
    }
    const [user] = await db
      .select({
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
        banReason: studyUsersTable.banReason,
        createdAt: studyUsersTable.createdAt,
      })
      .from(studyUsersTable)
      .where(eq(studyUsersTable.username, username))
      .limit(1);
    if (!user) {
      res.status(404).json({ error: "No Study Desk account found with that username." });
      return;
    }
    res.json(FindDeveloperManagedAccountResponse.parse(userSummary(user)));
  },
);

router.patch(
  "/developer/accounts/:username/role",
  requireAuthorizedDeveloper,
  async (req, res): Promise<void> => {
    const params = SetDeveloperManagedAccountRoleParams.safeParse(req.params);
    const body = SetDeveloperManagedAccountRoleBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Check the account username and selected role." });
      return;
    }
    const username = params.data.username.toLowerCase();
    if (!USERNAME_RE.test(username)) {
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
      res.status(404).json({ error: "No Study Desk account found with that username." });
      return;
    }
    if (body.data.role !== "user" && target.bannedAt) {
      res.status(409).json({ error: "Restore this account before assigning a privileged role." });
      return;
    }
    const [updated] = await db
      .update(studyUsersTable)
      .set({ role: body.data.role })
      .where(eq(studyUsersTable.id, target.id))
      .returning({
        username: studyUsersTable.username,
        role: studyUsersTable.role,
        bannedAt: studyUsersTable.bannedAt,
        banReason: studyUsersTable.banReason,
        createdAt: studyUsersTable.createdAt,
      });
    res.json(SetDeveloperManagedAccountRoleResponse.parse(userSummary(updated)));
  },
);

export default router;
