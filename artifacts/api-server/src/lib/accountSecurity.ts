import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured for account sessions");
}

const SESSION_COOKIE = "study_desk_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SUSPENSION_APPEAL_COOKIE = "study_desk_suspension_appeal";
const SUSPENSION_APPEAL_TTL_MS = 15 * 60 * 1000;
const PASSWORD_OPTIONS = {
  N: 1 << 15,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};
const PASSWORD_KEY_BYTES = 64;

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, PASSWORD_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `${salt.toString("hex")}.${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [saltHex, keyHex] = encoded.split(".");
  if (!/^[a-f0-9]{32}$/i.test(saltHex || "") || !/^[a-f0-9]{128}$/i.test(keyHex || "")) {
    return false;
  }
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derivePassword(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(expected, actual);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueValue(value: string): string {
  return createHmac("sha256", sessionSecret as string).update(value).digest("hex");
}

export function verifyOpaqueValue(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashOpaqueValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newRecoveryCode(): string {
  const bytes = randomBytes(18).toString("hex").toUpperCase();
  return bytes.match(/.{1,6}/g)?.join("-") || bytes;
}

export function setSessionCookie(res: { append(name: string, value: string): unknown }, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`,
  );
}

export function clearSessionCookie(res: { append(name: string, value: string): unknown }): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

export function setSuspensionAppealCookie(
  res: { append(name: string, value: string): unknown },
  userId: number,
  suspensionStartedAt: Date,
): void {
  const expiresAt = Date.now() + SUSPENSION_APPEAL_TTL_MS;
  const payload = Buffer.from(`${userId}:${suspensionStartedAt.getTime()}:${expiresAt}`).toString("base64url");
  const signature = createHmac("sha256", sessionSecret as string).update(payload).digest("base64url");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${SUSPENSION_APPEAL_COOKIE}=${payload}.${signature}; Path=/api/auth/suspension-appeals; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SUSPENSION_APPEAL_TTL_MS / 1000)}${secure}`,
  );
}

export function verifySuspensionAppealCookie(
  token: unknown,
): { userId: number; suspensionStartedAt: Date } | null {
  if (typeof token !== "string" || token.length > 256) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", sessionSecret as string).update(payload).digest();
  let decodedSignature: Buffer;
  try {
    decodedSignature = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (decodedSignature.length !== expected.length || !timingSafeEqual(decodedSignature, expected)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const match = /^(\d+):(\d+):(\d+)$/.exec(decoded);
  if (!match) return null;
  const userId = Number(match[1]);
  const startedAtMs = Number(match[2]);
  const expiresAtMs = Number(match[3]);
  if (
    !Number.isSafeInteger(userId) ||
    userId < 1 ||
    !Number.isSafeInteger(startedAtMs) ||
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs <= Date.now()
  ) {
    return null;
  }
  return { userId, suspensionStartedAt: new Date(startedAtMs) };
}

export function clearSuspensionAppealCookie(
  res: { append(name: string, value: string): unknown },
): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${SUSPENSION_APPEAL_COOKIE}=; Path=/api/auth/suspension-appeals; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

export const sessionCookieName = SESSION_COOKIE;
export const sessionTtlMs = SESSION_TTL_MS;
export const suspensionAppealCookieName = SUSPENSION_APPEAL_COOKIE;
