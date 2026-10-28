import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import * as oidc from "openid-client";
import { db, replitAuthSessionsTable, replitAuthUsersTable } from "@workspace/db";

export const DEVELOPER_SESSION_COOKIE = "study_desk_developer_session";
export const DEVELOPER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REPLIT_ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";

export interface DeveloperIdentity {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface DeveloperSessionData {
  user: DeveloperIdentity;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: oidc.Configuration | null = null;

export async function getDeveloperOidcConfig(): Promise<oidc.Configuration> {
  if (!oidcConfig) {
    const replId = process.env.REPL_ID;
    if (!replId) throw new Error("REPL_ID is required for developer sign-in.");
    oidcConfig = await oidc.discovery(new URL(REPLIT_ISSUER_URL), replId);
  }
  return oidcConfig;
}

export function getAuthorizedDeveloperEmails(): Set<string> {
  return new Set(
    (process.env.STUDY_DESK_DEVELOPER_REPLIT_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAuthorizedDeveloperEmail(email: string): boolean {
  return getAuthorizedDeveloperEmails().has(email.trim().toLowerCase());
}

export async function createDeveloperSession(data: DeveloperSessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(replitAuthSessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + DEVELOPER_SESSION_TTL_MS),
  });
  return sid;
}

export async function getDeveloperSession(sid: string): Promise<DeveloperSessionData | null> {
  const [row] = await db
    .select()
    .from(replitAuthSessionsTable)
    .where(eq(replitAuthSessionsTable.sid, sid))
    .limit(1);
  if (!row || row.expire <= new Date()) {
    if (row) await deleteDeveloperSession(sid);
    return null;
  }
  return row.sess as unknown as DeveloperSessionData;
}

export async function updateDeveloperSession(
  sid: string,
  data: DeveloperSessionData,
): Promise<void> {
  await db
    .update(replitAuthSessionsTable)
    .set({
      sess: data as unknown as Record<string, unknown>,
      expire: new Date(Date.now() + DEVELOPER_SESSION_TTL_MS),
    })
    .where(eq(replitAuthSessionsTable.sid, sid));
}

export async function deleteDeveloperSession(sid: string): Promise<void> {
  await db.delete(replitAuthSessionsTable).where(eq(replitAuthSessionsTable.sid, sid));
}

export async function upsertReplitDeveloper(claims: Record<string, unknown>): Promise<DeveloperIdentity> {
  const id = typeof claims.sub === "string" ? claims.sub : "";
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!id || !email) throw new Error("Replit sign-in did not provide a user ID and email.");

  const userData = {
    id,
    email,
    firstName: typeof claims.first_name === "string" ? claims.first_name : null,
    lastName: typeof claims.last_name === "string" ? claims.last_name : null,
    profileImageUrl:
      typeof claims.profile_image_url === "string"
        ? claims.profile_image_url
        : typeof claims.picture === "string"
          ? claims.picture
          : null,
  };
  const [user] = await db
    .insert(replitAuthUsersTable)
    .values(userData)
    .onConflictDoUpdate({
      target: replitAuthUsersTable.id,
      set: { ...userData, updatedAt: new Date() },
    })
    .returning();
  return {
    id: user.id,
    email: user.email ?? email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}
