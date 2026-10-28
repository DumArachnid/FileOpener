import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  GetCurrentUserResponse,
  LogInBody,
  LogInResponse,
  RecoverAccountBody,
  RecoverAccountResponse,
  SignUpBody,
  SignUpResponse,
} from "@workspace/api-zod";
import { db, studySessionsTable, studyUsersTable } from "@workspace/db";
import { authRateLimit } from "../middlewares/authRateLimit";
import {
  clearSessionCookie,
  hashOpaqueValue,
  hashPassword,
  newRecoveryCode,
  newSessionToken,
  sessionTtlMs,
  setSessionCookie,
  verifyPassword,
  verifyOpaqueValue,
} from "../lib/accountSecurity";

const router: IRouter = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

async function createSession(userId: number, res: Response): Promise<void> {
  const token = newSessionToken();
  await db.insert(studySessionsTable).values({
    tokenHash: hashOpaqueValue(token),
    userId,
    expiresAt: new Date(Date.now() + sessionTtlMs),
  });
  setSessionCookie(res, token);
}

router.post("/auth/signup", authRateLimit, async (req, res): Promise<void> => {
  const parsed = SignUpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a 3–24 character username and a password of at least 12 characters." });
    return;
  }
  const username = parsed.data.username.toLowerCase();
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: "Usernames may use letters, numbers, and underscores." });
    return;
  }

  const recoveryCode = newRecoveryCode();
  try {
    const [user] = await db
      .insert(studyUsersTable)
      .values({
        username,
        passwordHash: await hashPassword(parsed.data.password),
        recoveryCodeHash: hashOpaqueValue(recoveryCode),
      })
      .returning({ id: studyUsersTable.id, username: studyUsersTable.username });
    await createSession(user.id, res);
    const response = SignUpResponse.parse({
      user: { username: user.username },
      recoveryCode,
    });
    res.status(201).json(response);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    req.log.error({ err: error }, "Account creation failed");
    res.status(500).json({ error: "Could not create the account right now." });
  }
});

router.post("/auth/login", authRateLimit, async (req, res): Promise<void> => {
  const parsed = LogInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a username and password." });
    return;
  }
  const username = parsed.data.username.toLowerCase();
  const [user] = await db
    .select()
    .from(studyUsersTable)
    .where(eq(studyUsersTable.username, username))
    .limit(1);

  const valid = user
    ? await verifyPassword(parsed.data.password, user.passwordHash)
    : (await hashPassword(parsed.data.password), false);
  if (!user || !valid) {
    res.status(401).json({ error: "Username or password is incorrect." });
    return;
  }

  await createSession(user.id, res);
  res.json(
    LogInResponse.parse({
      user: { username: user.username },
      recoveryCode: null,
    }),
  );
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.studyDeskSessionHash) {
    await db
      .delete(studySessionsTable)
      .where(eq(studySessionsTable.tokenHash, req.studyDeskSessionHash));
  }
  clearSessionCookie(res);
  res.sendStatus(204);
});

router.get("/auth/me", (req, res): void => {
  if (!req.studyDeskUser) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  res.json(GetCurrentUserResponse.parse({ user: { username: req.studyDeskUser.username } }));
});

router.post("/auth/recover", authRateLimit, async (req, res): Promise<void> => {
  const parsed = RecoverAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check your username, recovery code, and new password." });
    return;
  }
  const username = parsed.data.username.toLowerCase();
  const [user] = await db
    .select()
    .from(studyUsersTable)
    .where(eq(studyUsersTable.username, username))
    .limit(1);
  if (
    !user ||
    !verifyOpaqueValue(parsed.data.recoveryCode.trim().toUpperCase(), user.recoveryCodeHash)
  ) {
    res.status(400).json({ error: "Username or recovery code is incorrect." });
    return;
  }

  const nextRecoveryCode = newRecoveryCode();
  const nextPasswordHash = await hashPassword(parsed.data.newPassword);
  const recovered = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(studyUsersTable)
      .set({
        passwordHash: nextPasswordHash,
        recoveryCodeHash: hashOpaqueValue(nextRecoveryCode),
      })
      .where(
        and(
          eq(studyUsersTable.id, user.id),
          eq(studyUsersTable.recoveryCodeHash, user.recoveryCodeHash),
        ),
      )
      .returning({ id: studyUsersTable.id });
    if (!updated) {
      return false;
    }
    await tx.delete(studySessionsTable).where(eq(studySessionsTable.userId, user.id));
    return true;
  });
  if (!recovered) {
    res.status(400).json({ error: "Username or recovery code is incorrect." });
    return;
  }
  await createSession(user.id, res);
  res.json(
    RecoverAccountResponse.parse({
      user: { username: user.username },
      recoveryCode: nextRecoveryCode,
    }),
  );
});

export default router;
