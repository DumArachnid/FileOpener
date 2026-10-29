import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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

async function request(route, { method = "GET", cookie, body } = {}) {
  const headers = {
    "x-forwarded-for": `198.51.100.${(forwardedIp++ % 200) + 1}`,
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
  if (text) data = JSON.parse(text);
  const sessionCookie = (response.headers.getSetCookie?.() ?? [])
    .map((value) => value.match(/(?:^|,\s*)study_desk_session=([^;]*)/))
    .find(Boolean)?.[1];
  return {
    status: response.status,
    data,
    cookie: sessionCookie ? `study_desk_session=${sessionCookie}` : undefined,
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

before(async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required to run API integration tests");
  assert.ok(process.env.SESSION_SECRET, "SESSION_SECRET is required to run API integration tests");

  const port = await availablePort();
  apiBaseUrl = `http://127.0.0.1:${port}`;
  apiProcess = spawn(process.execPath, ["--enable-source-maps", "dist/index.mjs"], {
    cwd: apiDirectory,
    env: { ...process.env, NODE_ENV: "test", PORT: String(port) },
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
  if (fixtureUsernames.length) {
    await cleanupPool.query("DELETE FROM study_desk_users WHERE username = ANY($1)", [
      fixtureUsernames,
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
