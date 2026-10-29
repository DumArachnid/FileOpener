import { randomBytes } from "node:crypto";
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
const OFFLINE_HANDOFF_STATE_RE = /^[a-f0-9]{64}$/i;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function sendOfflineHandoffPage(
  res: Response,
  options: {
    state?: string;
    error?: string;
    user?: { username: string; role: string };
  },
  status = 200,
): void {
  const nonce = randomBytes(18).toString("base64");
  const safeState = options.state ? escapeHtml(options.state) : "";
  let content: string;

  if (options.user && options.state) {
    const payload = safeInlineJson({
      type: "study-desk-offline-account-verified",
      state: options.state,
      user: {
        username: options.user.username,
        role: options.user.role,
      },
    });
    content = `
      <h1>Account verified</h1>
      <p>You signed in as <strong>${escapeHtml(options.user.username)}</strong> with the <strong>${escapeHtml(options.user.role)}</strong> rank.</p>
      <p>Only your username and rank will be sent to the downloaded Study Desk copy. Your password and sign-in session are not shared with it.</p>
      <button id="continueButton" type="button">Send verification to Study Desk</button>
      <p id="handoffStatus" role="status" aria-live="polite"></p>
      <script nonce="${nonce}">
        const result = ${payload};
        document.getElementById("continueButton").addEventListener("click", () => {
          if (!window.opener || window.opener.closed) {
            document.getElementById("handoffStatus").textContent = "The downloaded copy is no longer open. Close this window and try again.";
            return;
          }
          window.opener.postMessage(result, "*");
          document.getElementById("continueButton").disabled = true;
          document.getElementById("handoffStatus").textContent = "Verification sent. You may close this window.";
          window.setTimeout(() => window.close(), 700);
        });
      </script>`;
  } else if (options.state) {
    content = `
      <h1>Verify your Study Desk account</h1>
      <p>Sign in here to verify an account for a downloaded Study Desk copy. Your password is sent only to the Study Desk server.</p>
      ${options.error ? `<p class="error" role="alert">${escapeHtml(options.error)}</p>` : ""}
      <form method="post" action="/api/auth/offline-handoff">
        <input type="hidden" name="state" value="${safeState}">
        <label for="username">Username</label>
        <input id="username" name="username" type="text" autocomplete="username" minlength="3" maxlength="24" required autofocus>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" maxlength="128" required>
        <button type="submit">Verify account</button>
      </form>
      <p class="fine">This confirms your account for the current downloaded-copy session. It does not sync workspace data.</p>`;
  } else {
    content = `
      <h1>Could not start account verification</h1>
      <p>${escapeHtml(options.error || "The request is invalid. Close this window and try again from Study Desk.")}</p>`;
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  );
  res.status(status).type("html").send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Study Desk account verification</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f3f3f3; color: #171717; font: 16px/1.5 system-ui, sans-serif; }
          main { width: min(100%, 440px); padding: 30px; border: 1px solid #d2d2d2; border-radius: 16px; background: #fff; box-shadow: 0 14px 40px #00000012; }
          .brand { margin-bottom: 22px; color: #666; font-size: 11px; font-weight: 800; letter-spacing: .12em; }
          h1 { margin: 0 0 12px; font-size: 25px; line-height: 1.15; letter-spacing: -.03em; }
          p { color: #555; }
          label { display: block; margin: 16px 0 6px; font-size: 13px; font-weight: 700; }
          input { display: block; width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid #bcbcbc; border-radius: 9px; font: inherit; }
          button { width: 100%; min-height: 46px; margin-top: 20px; border: 0; border-radius: 9px; background: #333; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
          button:disabled { opacity: .65; cursor: default; }
          .error { padding: 10px 12px; border-radius: 8px; background: #fff0ef; color: #9b211b; font-size: 14px; }
          .fine { margin: 18px 0 0; font-size: 12px; }
          #handoffStatus { min-height: 24px; margin-bottom: 0; font-size: 13px; }
        </style>
      </head>
      <body>
        <main>
          <div class="brand">STUDY DESK / SECURE ACCOUNT CHECK</div>
          ${content}
        </main>
      </body>
    </html>`);
}

function hasErrorCode(error: unknown, code: string): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === code) {
      return true;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

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
    res.status(400).json({ error: "Choose a 3–24 character username and a password of at least 10 characters." });
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
      .returning({ id: studyUsersTable.id, username: studyUsersTable.username, role: studyUsersTable.role });
    await createSession(user.id, res);
    const response = SignUpResponse.parse({
      user: { username: user.username, role: user.role },
      recoveryCode,
    });
    res.status(201).json(response);
  } catch (error) {
    if (hasErrorCode(error, "23505")) {
      res.status(409).json({ error: "That username is already taken." });
      return;
    }
    req.log.error({ err: error }, "Account creation failed");
    res.status(500).json({ error: "Could not create the account right now." });
  }
});

router.get("/auth/offline-handoff", (req, res): void => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!OFFLINE_HANDOFF_STATE_RE.test(state)) {
    sendOfflineHandoffPage(res, {
      error: "The request is invalid. Close this window and try again from the downloaded Study Desk copy.",
    }, 400);
    return;
  }
  sendOfflineHandoffPage(res, { state });
});

router.post("/auth/offline-handoff", authRateLimit, async (req, res): Promise<void> => {
  const state = typeof req.body?.state === "string" ? req.body.state : "";
  if (!OFFLINE_HANDOFF_STATE_RE.test(state)) {
    sendOfflineHandoffPage(res, {
      error: "The request is invalid. Close this window and try again from the downloaded Study Desk copy.",
    }, 400);
    return;
  }
  const parsed = LogInBody.safeParse(req.body);
  if (!parsed.success) {
    sendOfflineHandoffPage(res, { state, error: "Enter a username and password." }, 400);
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
    sendOfflineHandoffPage(res, { state, error: "Username or password is incorrect." }, 401);
    return;
  }
  if (user.bannedAt) {
    sendOfflineHandoffPage(res, { state, error: "This account is suspended." }, 403);
    return;
  }

  sendOfflineHandoffPage(res, {
    state,
    user: { username: user.username, role: user.role },
  });
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
  if (user.bannedAt) {
    res.status(403).json({ error: "This account is suspended." });
    return;
  }

  await createSession(user.id, res);
  res.json(
    LogInResponse.parse({
      user: { username: user.username, role: user.role },
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
  res.json(
    GetCurrentUserResponse.parse({
      user: { username: req.studyDeskUser.username, role: req.studyDeskUser.role },
    }),
  );
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
      user: { username: user.username, role: user.role },
      recoveryCode: nextRecoveryCode,
    }),
  );
});

export default router;
