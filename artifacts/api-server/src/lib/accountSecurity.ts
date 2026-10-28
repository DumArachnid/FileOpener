import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured for account sessions");
}

const SESSION_COOKIE = "study_desk_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

export function setSessionCookie(res: { setHeader(name: string, value: string): unknown }, token: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secure}`,
  );
}

export function clearSessionCookie(res: { setHeader(name: string, value: string): unknown }): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

export const sessionCookieName = SESSION_COOKIE;
export const sessionTtlMs = SESSION_TTL_MS;
