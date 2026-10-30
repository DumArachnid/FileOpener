import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDatabasePackage = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
);
const { Pool } = requireDatabasePackage("pg");
const cleanupPool = new Pool({ connectionString: process.env.DATABASE_URL });
const fixtureUsernames = [];
const fixtureRandomLinkIds = [];
const fixtureRandomLinkClaimKeys = [];
const fixtureDeveloperSessionIds = [];
const developerTestEmail = `developer-${randomUUID()}@example.test`;
const unverifiedDeveloperEmail = `unverified-${randomUUID()}@example.test`;
const missingAccountDeveloperEmail = `missing-${randomUUID()}@example.test`;
const developerTargetUsername = `replit_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const missingMappedUsername = `missing_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
fixtureUsernames.push(developerTargetUsername);

let apiProcess;
let apiBaseUrl;
let forwardedIp = 0;

function uniqueUsername() {
  const username = `test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  fixtureUsernames.push(username);
  return username;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  assert.ok(address && typeof address === "object");
  return address.port;
}

async function request(route, { method = "GET", cookie, body, headers: additionalHeaders } = {}) {
  const headers = {
    "x-forwarded-for": `198.51.100.${(forwardedIp++ % 200) + 1}`,
    ...additionalHeaders,
  };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${apiBaseUrl}/api${route}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = response.status === 204 ? "" : await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  const sessionCookie = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.match(/(?:^|,\s*)study_desk_session=([^;]*)/))
    .find(Boolean)?.[1];
  const appealCookie = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.match(/(?:^|,\s*)study_desk_suspension_appeal=([^;]*)/))
    .find(Boolean)?.[1];
  const visitorToken = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.match(/(?:^|,\s*)study_desk_random_link_visitor=([^;]*)/))
    .find(Boolean)?.[1];
  const randomVisitorCookie = visitorToken
    ? `study_desk_random_link_visitor=${visitorToken}`
    : undefined;
  if (visitorToken) {
    fixtureRandomLinkClaimKeys.push(
      `visitor:${createHash("sha256").update(decodeURIComponent(visitorToken)).digest("hex")}`,
    );
  }
  return {
    status: response.status,
    data,
    cookie: sessionCookie ? `study_desk_session=${sessionCookie}` : undefined,
    appealCookie: appealCookie ? `study_desk_suspension_appeal=${appealCookie}` : undefined,
    randomVisitorCookie,
    randomLinkNextAvailableAt: response.headers.get("X-Random-Link-Next-Available-At"),
  };
}

async function signUp(username = uniqueUsername()) {
  const response = await request("/auth/signup", {
    method: "POST",
    body: { username, password: "fixture-password-123" },
  });
  assert.equal(response.status, 201);
  assert.ok(response.cookie, "signup should establish an account session");
  return { username, cookie: response.cookie, recoveryCode: response.data.recoveryCode };
}

async function createDeveloperTestSession(email, emailVerified = true) {
  const sid = randomUUID().replaceAll("-", "");
  fixtureDeveloperSessionIds.push(sid);
  const session = {
    user: {
      id: `replit-${randomUUID()}`,
      email,
      emailVerified,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "test-session-only",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  };
  await cleanupPool.query(
    "INSERT INTO study_desk_replit_sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)",
    [sid, JSON.stringify(session), new Date(Date.now() + 60 * 60 * 1000)],
  );
  return `study_desk_developer_session=${sid}`;
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required to run API integration tests");
  assert.ok(process.env.SESSION_SECRET, "SESSION_SECRET is required to run API integration tests");

  const port = await availablePort();
  apiBaseUrl = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
    cwd: apiDirectory,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      STUDY_DESK_DEVELOPER_REPLIT_EMAILS: [
        developerTestEmail,
        unverifiedDeveloperEmail,
        missingAccountDeveloperEmail,
      ].join(","),
      STUDY_DESK_DEVELOPER_ACCOUNT_MAP: [
        `${developerTestEmail}=${developerTargetUsername}`,
        `${unverifiedDeveloperEmail}=${developerTargetUsername}`,
        `${missingAccountDeveloperEmail}=${missingMappedUsername}`,
      ].join(","),
    },
    stdio: "ignore",
  });

  let lastError;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(`API server exited before becoming ready (${apiProcess.exitCode})`);
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/healthz`);
      if (response.ok) return;
      lastError = new Error(`Health check returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API server did not become ready: ${lastError}`);
});

after(async () => {
  if (apiProcess && apiProcess.exitCode === null) {
    apiProcess.kill("SIGTERM");
  }
  if (fixtureDeveloperSessionIds.length) {
    await cleanupPool.query("DELETE FROM study_desk_replit_sessions WHERE sid = ANY($1)", [
      fixtureDeveloperSessionIds,
    ]);
  }
  if (fixtureUsernames.length) {
    const fixtureUsers = await cleanupPool.query(
      "SELECT id FROM study_desk_users WHERE username = ANY($1)",
      [fixtureUsernames],
    );
    fixtureRandomLinkClaimKeys.push(
      ...fixtureUsers.rows.map((user) => `account:${user.id}`),
    );
  }
  if (fixtureRandomLinkClaimKeys.length) {
    const claimKeys = fixtureRandomLinkClaimKeys.flatMap((key) => [key, `${key}:slot:2`]);
    await cleanupPool.query(
      "DELETE FROM study_desk_random_link_claims WHERE identity_key = ANY($1::text[])",
      [claimKeys],
    );
  }
  if (fixtureUsernames.length) {
    await cleanupPool.query(
      "DELETE FROM study_desk_admin_audit WHERE target_username = ANY($1) OR actor_username = ANY($1)",
      [fixtureUsernames],
    );
    await cleanupPool.query("DELETE FROM study_desk_users WHERE username = ANY($1)", [
      fixtureUsernames,
    ]);
  }
  if (fixtureRandomLinkIds.length) {
    await cleanupPool.query("DELETE FROM study_desk_random_links WHERE id = ANY($1::int[])", [
      fixtureRandomLinkIds,
    ]);
  }
  await cleanupPool.end();
});

test("signup, login, logout, and recovery codes behave as one-time credentials", async () => {
  const account = await signUp();
  assert.match(account.recoveryCode, /^[A-F0-9]{6}(?:-[A-F0-9]{6}){5}$/);

  const currentUser = await request("/auth/me", { cookie: account.cookie });
  assert.equal(currentUser.status, 200);
  assert.equal(currentUser.data.user.username, account.username);

  const duplicate = await request("/auth/signup", {
    method: "POST",
    body: { username: account.username, password: "fixture-password-123" },
  });
  assert.equal(duplicate.status, 409);

  const badLogin = await request("/auth/login", {
    method: "POST",
    body: { username: account.username, password: "incorrect-password" },
  });
  assert.equal(badLogin.status, 401);

  const logout = await request("/auth/logout", {
    method: "POST",
    cookie: account.cookie,
  });
  assert.equal(logout.status, 204);
  assert.equal((await request("/auth/me", { cookie: account.cookie })).status, 401);

  const login = await request("/auth/login", {
    method: "POST",
    body: { username: account.username.toUpperCase(), password: "fixture-password-123" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.username, account.username);
  assert.equal(login.data.recoveryCode, null);

  const recovery = await request("/auth/recover", {
    method: "POST",
    body: {
      username: account.username,
      recoveryCode: account.recoveryCode,
      newPassword: "replacement-password-456",
    },
  });
  assert.equal(recovery.status, 200);
  assert.notEqual(recovery.data.recoveryCode, account.recoveryCode);
  assert.ok(recovery.cookie);
  assert.equal((await request("/auth/me", { cookie: login.cookie })).status, 401);
  assert.equal((await request("/auth/me", { cookie: recovery.cookie })).status, 200);

  const reusedCode = await request("/auth/recover", {
    method: "POST",
    body: {
      username: account.username,
      recoveryCode: account.recoveryCode,
      newPassword: "another-password-789",
    },
  });
  assert.equal(reusedCode.status, 400);

  const oldPasswordLogin = await request("/auth/login", {
    method: "POST",
    body: { username: account.username, password: "fixture-password-123" },
  });
  assert.equal(oldPasswordLogin.status, 401);
  const newPasswordLogin = await request("/auth/login", {
    method: "POST",
    body: { username: account.username, password: "replacement-password-456" },
  });
  assert.equal(newPasswordLogin.status, 200);
});

test("timed suspensions expire and appeals are reviewed without creating a session", async () => {
  const target = await signUp();
  const moderator = await signUp();
  await cleanupPool.query("UPDATE study_desk_users SET role = 'moderator' WHERE username = $1", [
    moderator.username,
  ]);

  const hiddenQueue = await request("/moderation/suspension-appeals", { cookie: target.cookie });
  assert.equal(hiddenQueue.status, 403, "regular accounts must not access the appeal review queue");
  const selfBan = await request(`/moderation/users/${moderator.username}/ban`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { banned: true, reason: "self test", durationHours: 1 },
  });
  assert.equal(selfBan.status, 409, "moderators must not suspend themselves");

  const ban = await request(`/moderation/users/${target.username}/ban`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { banned: true, reason: "Testing a timed suspension", durationHours: 24 },
  });
  assert.equal(ban.status, 200);
  assert.equal(ban.data.banned, true);
  assert.ok(Date.parse(ban.data.banExpiresAt) > Date.now());

  const handoffState = randomUUID().replaceAll("-", "").repeat(2).slice(0, 64);
  const suspendedHandoff = await request("/auth/offline-handoff", {
    method: "POST",
    body: {
      state: handoffState,
      username: target.username,
      password: "fixture-password-123",
    },
  });
  assert.equal(suspendedHandoff.status, 403);
  assert.match(suspendedHandoff.data, /Account suspended/);
  assert.match(suspendedHandoff.data, /action="\/api\/auth\/suspension-appeals"/);
  assert.ok(suspendedHandoff.appealCookie, "valid credentials should receive an appeal-only cookie");
  assert.equal(suspendedHandoff.cookie, undefined, "suspension handoff must not create an account session");
  assert.equal((await request("/auth/me", { cookie: target.cookie })).status, 401);

  const submitted = await request("/auth/suspension-appeals", {
    method: "POST",
    cookie: suspendedHandoff.appealCookie,
    body: { statement: "I believe this suspension was applied by mistake." },
  });
  assert.equal(submitted.status, 201);
  assert.equal(submitted.data.status, "pending");
  assert.equal(submitted.cookie, undefined);

  const queue = await request("/moderation/suspension-appeals", { cookie: moderator.cookie });
  assert.equal(queue.status, 200);
  const appeal = queue.data.find((item) => item.id === submitted.data.id);
  assert.ok(appeal, "pending appeal should appear in the moderator queue");
  assert.equal(appeal.username, target.username);
  assert.equal(appeal.suspensionReason, "Testing a timed suspension");

  const missingReason = await request(`/moderation/suspension-appeals/${appeal.id}/decision`, {
    method: "POST",
    cookie: moderator.cookie,
    body: { decision: "uphold" },
  });
  assert.equal(missingReason.status, 400);

  const upheld = await request(`/moderation/suspension-appeals/${appeal.id}/decision`, {
    method: "POST",
    cookie: moderator.cookie,
    body: { decision: "uphold", reason: "The original report was confirmed." },
  });
  assert.equal(upheld.status, 200);
  assert.equal(upheld.data.status, "upheld");
  assert.equal(upheld.data.reviewerUsername, moderator.username);

  const stillSuspended = await request("/auth/login", {
    method: "POST",
    body: { username: target.username, password: "fixture-password-123" },
  });
  assert.equal(stillSuspended.status, 403);
  assert.equal(stillSuspended.data.suspension.appealStatus, "upheld");
  assert.equal(
    stillSuspended.data.suspension.appealDecisionReason,
    "The original report was confirmed.",
  );

  const lifted = await request(`/moderation/users/${target.username}/ban`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { banned: false },
  });
  assert.equal(lifted.status, 200);
  assert.equal(lifted.data.banned, false);
  assert.equal(lifted.data.banExpiresAt, null);

  const secondBan = await request(`/moderation/users/${target.username}/ban`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { banned: true, reason: "Testing automatic expiry", durationHours: 1 },
  });
  assert.equal(secondBan.status, 200);
  await cleanupPool.query(
    "UPDATE study_desk_users SET banned_until = NOW() - INTERVAL '1 minute' WHERE username = $1",
    [target.username],
  );

  const afterExpiry = await request("/auth/login", {
    method: "POST",
    body: { username: target.username, password: "fixture-password-123" },
  });
  assert.equal(afterExpiry.status, 200, "expired suspensions should not require an admin visit to lift");
  const storedUser = await cleanupPool.query(
    "SELECT banned_at, banned_until, ban_reason FROM study_desk_users WHERE username = $1",
    [target.username],
  );
  assert.equal(storedUser.rows[0].banned_at, null);
  assert.equal(storedUser.rows[0].banned_until, null);
  assert.equal(storedUser.rows[0].ban_reason, null);

  const history = await request(`/moderation/users/${target.username}/history`, {
    cookie: moderator.cookie,
  });
  assert.equal(history.status, 200);
  assert.ok(history.data.some((entry) => entry.action === "user.suspension.expired"));
  assert.ok(history.data.some((entry) => entry.action === "user.suspension.appeal_upheld"));
});

test("an allowlisted verified developer signs in to an explicitly linked existing account", async () => {
  assert.equal(
    (await request("/developer/auth/study-desk-session", { method: "POST" })).status,
    401,
  );

  const targetAccount = await signUp(developerTargetUsername);
  const developerCookie = await createDeveloperTestSession(developerTestEmail);
  const result = await request("/developer/auth/study-desk-session", {
    method: "POST",
    cookie: developerCookie,
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.user.username, developerTargetUsername);
  assert.equal(result.data.user.role, "user", "Replit sign-in must not promote account roles");
  assert.ok(result.cookie, "linked sign-in should establish a regular Study Desk session");

  const currentAccount = await request("/auth/me", { cookie: result.cookie });
  assert.equal(currentAccount.status, 200);
  assert.equal(currentAccount.data.user.username, targetAccount.username);

  const unverifiedCookie = await createDeveloperTestSession(unverifiedDeveloperEmail, false);
  assert.equal(
    (await request("/developer/auth/study-desk-session", {
      method: "POST",
      cookie: unverifiedCookie,
    })).status,
    403,
  );

  const missingAccountCookie = await createDeveloperTestSession(missingAccountDeveloperEmail);
  assert.equal(
    (await request("/developer/auth/study-desk-session", {
      method: "POST",
      cookie: missingAccountCookie,
    })).status,
    404,
  );

  const unauthorizedCookie = await createDeveloperTestSession("not-allowlisted@example.test");
  assert.equal(
    (await request("/developer/auth/study-desk-session", {
      method: "POST",
      cookie: unauthorizedCookie,
    })).status,
    403,
  );
});

test("offline account handoff verifies credentials without issuing a session", async () => {
  const account = await signUp();
  const state = "a".repeat(64);
  const page = await request(`/auth/offline-handoff?state=${state}`);
  assert.equal(page.status, 200);
  assert.match(page.data, /name="state"/);
  assert.match(page.data, /action="\/api\/auth\/offline-handoff"/);
  assert.match(page.data, /Verify your Study Desk account/);

  const rejected = await request("/auth/offline-handoff", {
    method: "POST",
    body: { state, username: account.username, password: "wrong-password" },
  });
  assert.equal(rejected.status, 401);
  assert.match(rejected.data, /Username or password is incorrect/);
  assert.equal(rejected.cookie, undefined);

  const verified = await request("/auth/offline-handoff", {
    method: "POST",
    body: { state, username: account.username, password: "fixture-password-123" },
  });
  assert.equal(verified.status, 200);
  assert.match(verified.data, /study-desk-offline-account-verified/);
  assert.match(verified.data, new RegExp(`"state":"${state}"`));
  assert.match(verified.data, new RegExp(`"username":"${account.username}"`));
  assert.doesNotMatch(verified.data, /fixture-password-123/);
  assert.equal(verified.cookie, undefined, "offline verification must not issue a reusable session");

  const invalidState = await request("/auth/offline-handoff?state=not-a-secure-state");
  assert.equal(invalidState.status, 400);
});

test("downloaded copy validates the server handoff and explains unavailable-server timeouts", async () => {
  const workspaceHtml = await readFile(
    path.resolve(apiDirectory, "../new-tab/public/workspace.html"),
    "utf8",
  );
  assert.match(workspaceHtml, /window\.location\.protocol === 'file:'/);
  assert.match(workspaceHtml, /dum-arachnid-tools\.replit\.app\/api\/auth\/offline-handoff/);
  assert.match(
    workspaceHtml,
    /event\.source !== offlineAuthPopup \|\| event\.origin !== ACCOUNT_HUB_ORIGIN/,
  );
  assert.match(workspaceHtml, /message\.state !== offlineAuthState/);
  assert.match(workspaceHtml, /Study Desk did not respond in time/);
  assert.match(workspaceHtml, /Workspace sync is unavailable in a downloaded copy/);
});

test("signup and password recovery require at least 10 characters", async () => {
  const username = uniqueUsername();
  const tooShortSignup = await request("/auth/signup", {
    method: "POST",
    body: { username, password: "123456789" },
  });
  assert.equal(tooShortSignup.status, 400);

  const signup = await request("/auth/signup", {
    method: "POST",
    body: { username, password: "1234567890" },
  });
  assert.equal(signup.status, 201, "a 10-character password should be accepted");

  const tooShortRecovery = await request("/auth/recover", {
    method: "POST",
    body: {
      username,
      recoveryCode: signup.data.recoveryCode,
      newPassword: "123456789",
    },
  });
  assert.equal(tooShortRecovery.status, 400);
});

test("announcements are public to read and only developer accounts can manage them", async () => {
  const active = await request("/announcements/active");
  assert.equal(active.status, 200);
  assert.ok(Object.hasOwn(active.data, "announcement"));

  const announcement = { message: "Test announcement", durationSeconds: 30 };
  assert.equal(
    (await request("/announcements/active", { method: "POST", body: announcement })).status,
    401,
    "signed-out visitors must not publish announcements",
  );

  const account = await signUp();
  assert.equal(
    (await request("/announcements/active", {
      method: "POST",
      cookie: account.cookie,
      body: announcement,
    })).status,
    403,
    "regular accounts must not publish announcements",
  );
  assert.equal(
    (await request("/announcements/active", {
      method: "DELETE",
      cookie: account.cookie,
    })).status,
    403,
    "regular accounts must not end announcements",
  );
});

test("preferences, notes, and bookmarks sync only within their account", async () => {
  const firstAccount = await signUp();
  const secondAccount = await signUp();
  const firstData = {
    disguise_theme: "night",
    disguise_notes: "private note from first account",
    disguise_bookmarks: "private bookmark from first account",
  };

  assert.equal((await request("/sync")).status, 401);
  const firstUpdate = await request("/sync", {
    method: "PATCH",
    cookie: firstAccount.cookie,
    body: { updates: firstData },
  });
  assert.equal(firstUpdate.status, 200);
  assert.deepEqual(firstUpdate.data.data, firstData);

  const secondInitial = await request("/sync", { cookie: secondAccount.cookie });
  assert.equal(secondInitial.status, 200);
  assert.deepEqual(secondInitial.data.data, {});

  const secondData = {
    disguise_theme: "light",
    disguise_notes: "private note from second account",
    disguise_bookmarks: "private bookmark from second account",
  };
  const secondUpdate = await request("/sync", {
    method: "PATCH",
    cookie: secondAccount.cookie,
    body: { updates: secondData },
  });
  assert.equal(secondUpdate.status, 200);
  assert.deepEqual(secondUpdate.data.data, secondData);

  const secondRevisionUpdate = await request("/sync", {
    method: "PATCH",
    cookie: secondAccount.cookie,
    body: { updates: { disguise_theme: "contrast" } },
  });
  assert.equal(secondRevisionUpdate.status, 200);
  assert.equal(secondRevisionUpdate.data.revision, 1);

  const firstAfterSecondUpdate = await request("/sync", { cookie: firstAccount.cookie });
  const secondAfterUpdate = await request("/sync", { cookie: secondAccount.cookie });
  assert.deepEqual(firstAfterSecondUpdate.data.data, firstData);
  assert.deepEqual(secondAfterUpdate.data.data, { ...secondData, disguise_theme: "contrast" });
  assert.equal(firstAfterSecondUpdate.data.revision, 0);
  assert.equal(secondAfterUpdate.data.revision, 1);
});

test("extension drafts stay private and only their owner can edit or delete them", async () => {
  const owner = await signUp();
  const otherAccount = await signUp();
  const created = await request("/store/extensions", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "Private test draft",
      description: "A temporary extension draft for regression coverage.",
      code: "globalThis.fixtureExtension = true;",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.published, false);
  assert.equal(created.data.approvalStatus, "draft");
  const extensionId = created.data.id;

  const publicList = await request("/store/extensions");
  assert.equal(publicList.status, 200);
  assert.equal(publicList.data.some((extension) => extension.id === extensionId), false);
  assert.equal((await request(`/store/extensions/${extensionId}`)).status, 404);

  const ownerDraft = await request(`/store/extensions/${extensionId}`, {
    cookie: owner.cookie,
  });
  assert.equal(ownerDraft.status, 200);
  assert.equal(ownerDraft.data.code, "globalThis.fixtureExtension = true;");
  const ownerList = await request("/store/mine", { cookie: owner.cookie });
  assert.ok(ownerList.data.some((extension) => extension.id === extensionId));
  const otherList = await request("/store/mine", { cookie: otherAccount.cookie });
  assert.equal(otherList.data.some((extension) => extension.id === extensionId), false);
  assert.equal(
    (await request(`/store/extensions/${extensionId}`, { cookie: otherAccount.cookie })).status,
    404,
  );

  const updateBody = {
    name: "Updated private test draft",
    description: "Updated by the owner only.",
    code: "globalThis.fixtureExtension = false;",
  };
  const forbiddenUpdate = await request(`/store/extensions/${extensionId}`, {
    method: "PATCH",
    cookie: otherAccount.cookie,
    body: updateBody,
  });
  assert.equal(forbiddenUpdate.status, 404);
  const forbiddenDelete = await request(`/store/extensions/${extensionId}`, {
    method: "DELETE",
    cookie: otherAccount.cookie,
  });
  assert.equal(forbiddenDelete.status, 404);

  const ownerUpdate = await request(`/store/extensions/${extensionId}`, {
    method: "PATCH",
    cookie: owner.cookie,
    body: updateBody,
  });
  assert.equal(ownerUpdate.status, 200);
  assert.equal(ownerUpdate.data.name, updateBody.name);
  assert.equal(ownerUpdate.data.published, false);

  const publish = await request(`/store/extensions/${extensionId}/publish`, {
    method: "POST",
    cookie: owner.cookie,
  });
  assert.equal(publish.status, 200);
  assert.equal(publish.data.published, true);
  assert.equal(publish.data.approvalStatus, "pending");
  assert.equal(
    (await request(`/store/extensions/${extensionId}`, { cookie: otherAccount.cookie })).status,
    404,
    "pending moderation must not expose the extension to other accounts",
  );

  const ownerDelete = await request(`/store/extensions/${extensionId}`, {
    method: "DELETE",
    cookie: owner.cookie,
  });
  assert.equal(ownerDelete.status, 204);
});

test("random curated links are public to request and moderator-managed", async () => {
  const initialCatalogResponse = await request("/moderation/random-links");
  assert.equal(initialCatalogResponse.status, 401);

  const regularAccount = await signUp();
  assert.equal(
    (await request("/moderation/random-links", { cookie: regularAccount.cookie })).status,
    403,
  );

  const moderator = await signUp();
  await cleanupPool.query("UPDATE study_desk_users SET role = 'moderator' WHERE username = $1", [
    moderator.username,
  ]);
  const initialCatalog = await request("/moderation/random-links", { cookie: moderator.cookie });
  assert.equal(initialCatalog.status, 200);
  const initiallyActiveIds = initialCatalog.data.filter((link) => link.enabled).map((link) => link.id);

  const initialRandom = await request("/random-links/random");
  assert.equal(initialRandom.status, 200);
  assert.ok(initialRandom.randomVisitorCookie);
  if (!initiallyActiveIds.length) {
    assert.deepEqual(initialRandom.data, { link: null });
  } else {
    assert.ok(initiallyActiveIds.includes(initialRandom.data.link?.id));
  }

  const linkUrl = `https://random-link-${randomUUID()}.example.test/course`;
  const created = await request("/moderation/random-links", {
    method: "POST",
    cookie: moderator.cookie,
    body: { title: "  Curated test resource  ", url: linkUrl, enabled: true },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.title, "Curated test resource");
  assert.equal(created.data.url, linkUrl);
  assert.equal(created.data.enabled, true);
  fixtureRandomLinkIds.push(created.data.id);

  const duplicate = await request("/moderation/random-links", {
    method: "POST",
    cookie: moderator.cookie,
    body: { title: "Duplicate", url: linkUrl, enabled: true },
  });
  assert.equal(duplicate.status, 409);

  for (const unsafeUrl of ["javascript:alert(1)", "https://user:password@example.test/"]) {
    const invalid = await request("/moderation/random-links", {
      method: "POST",
      cookie: moderator.cookie,
      body: { title: "Unsafe link", url: unsafeUrl, enabled: true },
    });
    assert.equal(invalid.status, 400);
  }

  const guestWindowStartedAt = Date.now();
  const randomWithCreatedLink = await request("/random-links/random");
  assert.equal(randomWithCreatedLink.status, 200);
  assert.ok(randomWithCreatedLink.randomVisitorCookie);
  assert.ok(randomWithCreatedLink.data.link);
  assert.match(
    randomWithCreatedLink.data.link.url,
    /^https?:\/\//,
  );
  assert.equal(randomWithCreatedLink.randomLinkNextAvailableAt, null);
  const guestSecond = await request("/random-links/random", {
    cookie: randomWithCreatedLink.randomVisitorCookie,
  });
  assert.equal(guestSecond.status, 200);
  assert.ok(guestSecond.data.link);
  const guestNextAvailableAt = Date.parse(guestSecond.randomLinkNextAvailableAt);
  assert.ok(guestNextAvailableAt > Date.now());
  assert.ok(Math.abs(guestNextAvailableAt - (guestWindowStartedAt + 24 * 60 * 60 * 1000)) < 10_000);
  const guestRepeat = await request("/random-links/random", {
    cookie: randomWithCreatedLink.randomVisitorCookie,
  });
  assert.equal(guestRepeat.status, 429);
  assert.equal(guestRepeat.data.dailyLimit, true);
  assert.match(guestRepeat.data.error, /2 random links/);
  assert.equal(Date.parse(guestRepeat.data.availableAt), guestNextAvailableAt);
  assert.ok(Number(guestRepeat.data.retryAfterSeconds) > 0);

  const accountRandom = await request("/random-links/random", {
    cookie: regularAccount.cookie,
  });
  assert.equal(accountRandom.status, 200);
  const accountSecond = await request("/random-links/random", {
    cookie: regularAccount.cookie,
  });
  assert.equal(accountSecond.status, 200);
  const accountRepeat = await request("/random-links/random", {
    cookie: regularAccount.cookie,
  });
  assert.equal(accountRepeat.status, 429);
  assert.equal(accountRepeat.data.dailyLimit, true);

  const activeIds = (await request("/moderation/random-links", { cookie: moderator.cookie }))
    .data.filter((link) => link.enabled).map((link) => link.id);
  assert.ok(activeIds.includes(randomWithCreatedLink.data.link.id));

  const disabled = await request(`/moderation/random-links/${created.data.id}`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { title: created.data.title, url: created.data.url, enabled: false },
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.data.enabled, false);
  const randomAfterDisable = await request("/random-links/random");
  assert.equal(randomAfterDisable.status, 200);
  assert.notEqual(randomAfterDisable.data.link?.id, created.data.id);

  const updatedUrl = `${linkUrl}?source=updated`;
  const updated = await request(`/moderation/random-links/${created.data.id}`, {
    method: "PATCH",
    cookie: moderator.cookie,
    body: { title: "Updated resource", url: updatedUrl, enabled: true },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.title, "Updated resource");
  assert.equal(updated.data.url, updatedUrl);

  assert.equal(
    (await request(`/moderation/random-links/${created.data.id}`, {
      method: "DELETE",
      cookie: regularAccount.cookie,
    })).status,
    403,
  );
  const removed = await request(`/moderation/random-links/${created.data.id}`, {
    method: "DELETE",
    cookie: moderator.cookie,
  });
  assert.equal(removed.status, 204);
});
